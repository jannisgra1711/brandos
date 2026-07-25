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

const MAX_TOKENS = 16_000;

let client: Anthropic | undefined;

function getClient(apiKey: string): Anthropic {
  client ??= new Anthropic({ apiKey, maxRetries: 2 });
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
