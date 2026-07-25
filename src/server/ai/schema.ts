import { z } from "zod";

/**
 * Vertrag für die Modellantwort.
 *
 * Zwei Repräsentationen derselben Struktur:
 *
 * - `INTERPRETATION_JSON_SCHEMA` wird als `output_config.format` an die API
 *   übergeben und erzwingt die Form bereits bei der Generierung.
 * - `interpretationSchema` validiert die Antwort anschliessend nochmals lokal.
 *
 * Die doppelte Absicherung ist Absicht: Struktur-Constraints der API
 * garantieren die Form, nicht die fachliche Plausibilität. Erst die lokale
 * Validierung entscheidet, ob das Ergebnis in die Domain darf.
 */

export const interpretationSchema = z.object({
  summary: z.string().min(1),
  verdict: z.string().min(1),
  insights: z
    .array(
      z.object({
        kind: z.enum(["opportunity", "risk", "pattern", "audience", "design", "timing"]),
        title: z.string().min(1),
        detail: z.string().min(1),
        confidence: z.number().min(0).max(1),
        evidence: z.array(z.string()),
      }),
    )
    .max(12),
  opportunities: z.array(z.string()).max(8),
  risks: z.array(z.string()).max(8),
  recommendedActions: z.array(z.string()).max(8),
  ideas: z
    .array(
      z.object({
        title: z.string().min(1),
        niche: z.string(),
        productType: z.string(),
        audience: z.string(),
        emotion: z.string(),
        style: z.string(),
        differentiator: z.string(),
        rationale: z.string().min(1),
        potential: z.number().min(0).max(100),
        distinctiveness: z.number().min(0).max(100),
        priceMin: z.number().min(0),
        priceMax: z.number().min(0),
        risks: z.array(z.string()),
      }),
    )
    .max(8),
});

export type InterpretationPayload = z.infer<typeof interpretationSchema>;

/**
 * JSON Schema für Structured Outputs.
 *
 * Beschränkungen der API: alle Objekte brauchen `additionalProperties: false`
 * und vollständige `required`-Listen; numerische Grenzen (minimum/maximum)
 * werden nicht unterstützt und deshalb ausschließlich lokal geprüft.
 */
export const INTERPRETATION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "verdict", "insights", "opportunities", "risks", "recommendedActions", "ideas"],
  properties: {
    summary: {
      type: "string",
      description: "Zwei bis drei Sätze: Was passiert in diesem Markt gerade?",
    },
    verdict: {
      type: "string",
      description: "Die Entscheidungsaussage in genau einem Satz.",
    },
    insights: {
      type: "array",
      description: "Vier bis sieben belegte Beobachtungen.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "title", "detail", "confidence", "evidence"],
        properties: {
          kind: {
            type: "string",
            enum: ["opportunity", "risk", "pattern", "audience", "design", "timing"],
          },
          title: { type: "string", description: "Kurze Überschrift, max. 60 Zeichen." },
          detail: { type: "string", description: "Ein bis zwei Sätze Erläuterung." },
          confidence: { type: "number", description: "Sicherheit der Aussage, 0 bis 1." },
          evidence: {
            type: "array",
            description: "Konkrete Zahlen oder Signale, auf die sich die Aussage stützt.",
            items: { type: "string" },
          },
        },
      },
    },
    opportunities: { type: "array", items: { type: "string" } },
    risks: { type: "array", items: { type: "string" } },
    recommendedActions: {
      type: "array",
      description: "Konkrete nächste Schritte, priorisiert.",
      items: { type: "string" },
    },
    ideas: {
      type: "array",
      description: "Neue Produktideen aus Kombinationen, keine Kopien bestehender Angebote.",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "title",
          "niche",
          "productType",
          "audience",
          "emotion",
          "style",
          "differentiator",
          "rationale",
          "potential",
          "distinctiveness",
          "priceMin",
          "priceMax",
          "risks",
        ],
        properties: {
          title: { type: "string" },
          niche: { type: "string" },
          productType: { type: "string" },
          audience: { type: "string" },
          emotion: { type: "string" },
          style: { type: "string" },
          differentiator: { type: "string", description: "Das Alleinstellungsmerkmal." },
          rationale: { type: "string" },
          potential: { type: "number", description: "0 bis 100." },
          distinctiveness: { type: "number", description: "0 bis 100." },
          priceMin: { type: "number" },
          priceMax: { type: "number" },
          risks: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
} as const;
