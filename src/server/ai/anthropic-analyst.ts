import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { clamp, round } from "@/domain/math";
import type { MarketInterpretation, ProductIdea } from "@/domain/types";
import { getConfig } from "@/server/config/env";
import { logger } from "@/server/logging/logger";
import { INTERPRETATION_JSON_SCHEMA, interpretationSchema } from "./schema";
import { SYSTEM_PROMPT, buildMarketBrief } from "./prompts";
import { AnalystError, type Analyst, type InterpretationInput } from "./types";

/**
 * Modellgestützte Interpretation.
 *
 * Entwurfsentscheidungen:
 *
 * - Structured Outputs statt Freitext-Parsing. Die Antwortform wird bereits
 *   bei der Generierung erzwungen; lokal wird trotzdem validiert.
 * - Streaming, weil `max_tokens` hoch liegt und ein nicht gestreamter Request
 *   in dieser Größe in HTTP-Timeouts laufen kann.
 * - Eine Ablehnung (`stop_reason: "refusal"`) ist kein Fehlerfall der
 *   Infrastruktur, sondern ein Ergebnis: sie wird als AnalystError gemeldet,
 *   woraufhin der Fallback-Analyst übernimmt.
 */

/**
 * Grosszügig bemessen, und das ist kein Luxus: `max_tokens` deckelt bei
 * Claude Opus 5 **Denkschritte und Antworttext gemeinsam**. Das Modell denkt
 * dort standardmässig, anders als bei Opus 4.8. Eine vollständige
 * Interpretation mit Erkenntnissen, Risiken und vier Produktideen ist bereits
 * mehrere tausend Token gross – mit einem knappen Limit bricht die Antwort
 * mitten im JSON ab, was hier als `max_tokens` ankommt und die Heuristik
 * übernehmen lässt. Der Abbruch sähe aus wie ein Modellfehler, wäre aber nur
 * ein zu kleines Budget.
 *
 * Bei dieser Grösse ist Streaming Pflicht – ein nicht gestreamter Request
 * läuft in HTTP-Timeouts.
 */
const MAX_TOKENS = 64_000;

let client: Anthropic | undefined;
let clientKey: string | undefined;

function getClient(apiKey: string): Anthropic {
  // Beim Schlüsselwechsel neu erzeugen: ein zwischengespeicherter Client hielte
  // sonst den alten Schlüssel fest, obwohl die Konfiguration längst eine andere
  // meldet – in Tests und nach `resetConfig()` genau die falsche Verbindung.
  if (!client || clientKey !== apiKey) {
    client = new Anthropic({ apiKey, maxRetries: 2 });
    clientKey = apiKey;
  }
  return client;
}

export const anthropicAnalyst: Analyst = {
  id: "anthropic",
  label: "BrandOS Analyst",

  isAvailable(): boolean {
    const { ai } = getConfig();
    return ai.mode !== "heuristic" && Boolean(ai.apiKey);
  },

  async interpret(input: InterpretationInput): Promise<MarketInterpretation> {
    const { ai } = getConfig();
    if (!ai.apiKey) {
      throw new AnalystError("anthropic", "Kein ANTHROPIC_API_KEY konfiguriert");
    }

    const log = logger.child("analyst");
    const ideaCount = input.ideaCount ?? 4;
    const brief = buildMarketBrief(input.signals, input.score, ideaCount);

    let message: Anthropic.Message;
    try {
      const stream = getClient(ai.apiKey).messages.stream({
        model: ai.model,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        // Ausdrücklich gesetzt statt auf den Standard zu vertrauen: Ob ein
        // weggelassenes Feld Denken bedeutet, hängt vom Modell ab – bei Opus 5
        // ja, bei Opus 4.8 nein. Ein Wechsel über BRANDOS_AI_MODEL würde das
        // Verhalten sonst stillschweigend ändern.
        thinking: { type: "adaptive" },
        output_config: {
          format: {
            type: "json_schema",
            schema: INTERPRETATION_JSON_SCHEMA,
          },
        },
        messages: [{ role: "user", content: brief }],
      });
      message = await stream.finalMessage();
    } catch (error) {
      if (error instanceof Anthropic.RateLimitError) {
        throw new AnalystError("anthropic", "Ratenlimit erreicht", error);
      }
      if (error instanceof Anthropic.APIConnectionError) {
        throw new AnalystError("anthropic", "Verbindung zum Modell fehlgeschlagen", error);
      }
      if (error instanceof Anthropic.APIError) {
        throw new AnalystError("anthropic", `API-Fehler ${error.status}: ${error.message}`, error);
      }
      throw new AnalystError("anthropic", "Unerwarteter Fehler bei der Interpretation", error);
    }

    if (message.stop_reason === "refusal") {
      throw new AnalystError(
        "anthropic",
        `Anfrage abgelehnt (${message.stop_details?.category ?? "ohne Kategorie"})`,
      );
    }
    if (message.stop_reason === "max_tokens") {
      throw new AnalystError("anthropic", "Antwort unvollständig – Token-Limit erreicht");
    }

    const text = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    if (!text.trim()) {
      throw new AnalystError("anthropic", "Leere Modellantwort");
    }

    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch (error) {
      throw new AnalystError("anthropic", "Antwort war kein gültiges JSON", error);
    }

    const parsed = interpretationSchema.safeParse(raw);
    if (!parsed.success) {
      throw new AnalystError(
        "anthropic",
        `Antwort entspricht nicht dem Schema: ${parsed.error.issues[0]?.message ?? "unbekannt"}`,
        parsed.error,
      );
    }

    log.info("Interpretation erzeugt", {
      term: input.signals.query.term,
      model: ai.model,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      ideas: parsed.data.ideas.length,
    });

    const currency = input.signals.pricing?.currency ?? "EUR";

    const ideas: ProductIdea[] = parsed.data.ideas.map((idea, index) => ({
      id: `idea-${index + 1}`,
      title: idea.title,
      composition: {
        niche: idea.niche,
        productType: idea.productType,
        audience: idea.audience,
        emotion: idea.emotion,
        style: idea.style,
        differentiator: idea.differentiator,
      },
      rationale: idea.rationale,
      potential: round(clamp(idea.potential), 1),
      distinctiveness: round(clamp(idea.distinctiveness), 1),
      suggestedPriceRange: {
        min: round(Math.min(idea.priceMin, idea.priceMax), 2),
        max: round(Math.max(idea.priceMin, idea.priceMax), 2),
        currency,
      },
      risks: idea.risks,
    }));

    return {
      summary: parsed.data.summary,
      verdict: parsed.data.verdict,
      insights: parsed.data.insights.map((insight) => ({
        ...insight,
        confidence: round(clamp(insight.confidence, 0, 1), 2),
      })),
      opportunities: parsed.data.opportunities,
      risks: parsed.data.risks,
      recommendedActions: parsed.data.recommendedActions,
      ideas,
      producedBy: { analyst: "anthropic", model: ai.model, degraded: false },
    };
  },
};
