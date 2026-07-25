import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MarketQuery } from "@/domain/types";
import { collectSignals } from "./aggregator";
import type { DataProvider, ProviderPayload, ProviderResult } from "./types";

/**
 * Der Aggregator ist die intrikateste Stelle des Systems: Er führt Quellen
 * zusammen, die einander widersprechen dürfen, und muss dabei nachvollziehbar
 * bleiben. Diese Tests sichern die vier Zusagen ab, auf denen die Analyse
 * aufbaut:
 *
 *   1. Teilausfälle sind kein Fehler, sondern eine Lücke.
 *   2. Konflikte werden nach Gewicht aufgelöst, nicht nach Reihenfolge.
 *   3. Zeitreihen bleiben unvermischt – sonst sind sie nicht mehr erklärbar.
 *   4. Die Datenqualität bildet die tatsächliche Lage ab.
 */

const QUERY: MarketQuery = { term: "Test", market: "DE" };
const NOW = new Date("2026-03-01T00:00:00.000Z");

/** Baut einen Provider, der ein festes Ergebnis liefert. */
function provider(config: {
  id: DataProvider["id"];
  priority: number;
  confidence: number;
  payload: ProviderPayload;
  capabilities?: DataProvider["capabilities"];
  freshnessDays?: number;
  synthetic?: boolean;
}): DataProvider {
  return {
    id: config.id,
    label: `${config.id} (Test)`,
    capabilities: config.capabilities ?? ["demand", "competition", "pricing"],
    kind: "mock",
    priority: config.priority,
    isAvailable: () => true,
    fetch: async (): Promise<ProviderResult> => ({
      confidence: config.confidence,
      synthetic: config.synthetic ?? false,
      freshnessDays: config.freshnessDays ?? 1,
      payload: config.payload,
    }),
  };
}

/** Baut einen Provider, der immer scheitert. */
function failingProvider(id: DataProvider["id"]): DataProvider {
  return {
    id,
    label: `${id} (Test)`,
    capabilities: ["demand"],
    kind: "mock",
    priority: 50,
    isAvailable: () => true,
    fetch: async () => {
      throw new Error("Quelle nicht erreichbar");
    },
  };
}

/** Provider, der auf das Abbruchsignal reagiert – simuliert eine Zeitüberschreitung. */
function hangingProvider(id: DataProvider["id"]): DataProvider {
  return {
    id,
    label: `${id} (Test)`,
    capabilities: ["demand"],
    kind: "mock",
    priority: 50,
    isAvailable: () => true,
    fetch: (_query, context) =>
      new Promise((_resolve, reject) => {
        context.signal.addEventListener("abort", () => reject(new Error("abgebrochen")), {
          once: true,
        });
      }),
  };
}

const demandA = {
  volumeIndex: 80,
  estimatedMonthlySearches: 100_000,
  growth90d: 0.2,
  growth12m: 0.3,
  direction: "rising" as const,
  series: [
    { period: "2026-01", value: 100 },
    { period: "2026-02", value: 110 },
  ],
};

const demandB = {
  volumeIndex: 20,
  estimatedMonthlySearches: 5_000,
  growth90d: 0.6,
  growth12m: 0.1,
  direction: "volatile" as const,
  series: [{ period: "2026-02", value: 999 }],
};

describe("collectSignals – Teilausfälle", () => {
  it("liefert ein Ergebnis, wenn nur eine von zwei Quellen antwortet", async () => {
    const signals = await collectSignals(QUERY, {
      now: NOW,
      providers: [
        provider({ id: "google-trends", priority: 20, confidence: 0.9, payload: { demand: demandA } }),
        failingProvider("etsy"),
      ],
    });

    assert.ok(signals.demand, "vorhandenes Signal muss erhalten bleiben");
    assert.equal(signals.dataQuality.sourceCount, 1);
  });

  it("protokolliert die gescheiterte Quelle mit Status und Meldung", async () => {
    const signals = await collectSignals(QUERY, {
      now: NOW,
      providers: [failingProvider("etsy")],
    });

    const entry = signals.sources.find((s) => s.source === "etsy");
    assert.equal(entry?.status, "error");
    assert.equal(entry?.confidence, 0);
    assert.match(entry?.message ?? "", /nicht erreichbar/);
  });

  it("wertet eine Zeitüberschreitung als 'timeout', nicht als Fehler", async () => {
    const signals = await collectSignals(QUERY, {
      now: NOW,
      timeoutMs: 20,
      providers: [hangingProvider("tiktok")],
    });

    assert.equal(signals.sources[0]?.status, "timeout");
  });

  it("bricht nicht ab, wenn gar keine Quelle antwortet", async () => {
    const signals = await collectSignals(QUERY, {
      now: NOW,
      providers: [failingProvider("etsy"), failingProvider("reddit")],
    });

    assert.equal(signals.demand, undefined);
    assert.equal(signals.dataQuality.sourceCount, 0);
    // Ohne Quellen muss die Konfidenz am Boden liegen, aber definiert sein.
    assert.ok(signals.dataQuality.confidence > 0 && signals.dataQuality.confidence < 0.2);
  });
});

describe("collectSignals – Konfliktauflösung", () => {
  it("übernimmt die Zeitreihe der stärksten Quelle unvermischt", async () => {
    const signals = await collectSignals(QUERY, {
      now: NOW,
      providers: [
        provider({ id: "tiktok", priority: 6, confidence: 0.5, payload: { demand: demandB } }),
        provider({ id: "google-trends", priority: 20, confidence: 0.9, payload: { demand: demandA } }),
      ],
    });

    // Gewicht: 20*0.9 = 18 gegen 6*0.5 = 3 – die Leitquelle gewinnt,
    // unabhängig von der Reihenfolge im Array.
    assert.deepEqual(signals.demand?.series, demandA.series);
    assert.equal(signals.demand?.volumeIndex, demandA.volumeIndex);
    assert.equal(signals.demand?.direction, "rising");
  });

  it("mischt Wachstumsraten gewichtet, statt eine Quelle zu verwerfen", async () => {
    const signals = await collectSignals(QUERY, {
      now: NOW,
      providers: [
        provider({ id: "google-trends", priority: 20, confidence: 0.9, payload: { demand: demandA } }),
        provider({ id: "tiktok", priority: 6, confidence: 0.5, payload: { demand: demandB } }),
      ],
    });

    // (0.2*18 + 0.6*3) / 21 = 0.2571…
    assert.ok(signals.demand);
    assert.ok(
      signals.demand.growth90d > 0.2 && signals.demand.growth90d < 0.6,
      `erwartet zwischen beiden Werten, war ${signals.demand.growth90d}`,
    );
  });

  it("mischt Preise über alle Beiträge hinweg", async () => {
    const signals = await collectSignals(QUERY, {
      now: NOW,
      providers: [
        provider({
          id: "etsy",
          priority: 10,
          confidence: 1,
          payload: {
            pricing: { currency: "EUR", min: 10, p25: 20, median: 30, p75: 40, max: 50, avgReviewsPerListing: 5 },
          },
        }),
        provider({
          id: "amazon",
          priority: 10,
          confidence: 1,
          payload: {
            pricing: { currency: "EUR", min: 20, p25: 30, median: 40, p75: 50, max: 60, avgReviewsPerListing: 15 },
          },
        }),
      ],
    });

    // Gleiches Gewicht → exaktes Mittel.
    assert.equal(signals.pricing?.median, 35);
    assert.equal(signals.pricing?.avgReviewsPerListing, 10);
  });

  it("bevorzugt Keywords, die mehrere Quellen bestätigen", async () => {
    const shared = { term: "bestätigt", volumeIndex: 10, growth90d: 0, competition: 50, rising: false };
    const single = { term: "einzeln", volumeIndex: 95, growth90d: 0, competition: 50, rising: false };

    const signals = await collectSignals(QUERY, {
      now: NOW,
      providers: [
        provider({
          id: "google-trends",
          priority: 20,
          confidence: 0.9,
          capabilities: ["keywords"],
          payload: { keywords: [shared, single] },
        }),
        provider({
          id: "reddit",
          priority: 18,
          confidence: 0.7,
          capabilities: ["keywords"],
          payload: { keywords: [shared] },
        }),
      ],
    });

    // Trotz deutlich geringerem Volumen steht der bestätigte Begriff vorn.
    assert.equal(signals.keywords[0]?.term, "bestätigt");
  });

  it("übernimmt den Rising-Flag, sobald eine Quelle ihn setzt", async () => {
    const base = { term: "begriff", volumeIndex: 50, growth90d: 0.1, competition: 40 };

    const signals = await collectSignals(QUERY, {
      now: NOW,
      providers: [
        provider({
          id: "google-trends",
          priority: 20,
          confidence: 0.9,
          capabilities: ["keywords"],
          payload: { keywords: [{ ...base, rising: false }] },
        }),
        provider({
          id: "tiktok",
          priority: 6,
          confidence: 0.5,
          capabilities: ["keywords"],
          payload: { keywords: [{ ...base, rising: true }] },
        }),
      ],
    });

    assert.equal(signals.keywords[0]?.rising, true);
  });

  it("normalisiert Produktarten-Anteile auf Summe 1", async () => {
    const signals = await collectSignals(QUERY, {
      now: NOW,
      providers: [
        provider({
          id: "etsy",
          priority: 10,
          confidence: 0.8,
          capabilities: ["products"],
          payload: {
            productTypes: [
              { type: "T-Shirt", share: 0.6, medianPrice: 25, growth90d: 0.1 },
              { type: "Tasse", share: 0.4, medianPrice: 15, growth90d: 0.05 },
            ],
          },
        }),
        provider({
          id: "amazon",
          priority: 8,
          confidence: 0.6,
          capabilities: ["products"],
          payload: {
            productTypes: [{ type: "T-Shirt", share: 1, medianPrice: 20, growth90d: 0.2 }],
          },
        }),
      ],
    });

    const total = signals.productTypes.reduce((sum, t) => sum + t.share, 0);
    assert.ok(Math.abs(total - 1) < 0.01, `Summe der Anteile war ${total}`);
    assert.equal(signals.productTypes[0]?.type, "T-Shirt");
  });
});

describe("collectSignals – Datenqualität", () => {
  it("steigt mit der Anzahl unabhängiger Quellen", async () => {
    const one = await collectSignals(QUERY, {
      now: NOW,
      providers: [provider({ id: "google-trends", priority: 20, confidence: 0.9, payload: { demand: demandA } })],
    });

    const many = await collectSignals(QUERY, {
      now: NOW,
      providers: [
        provider({ id: "google-trends", priority: 20, confidence: 0.9, payload: { demand: demandA } }),
        provider({ id: "etsy", priority: 10, confidence: 0.9, payload: { demand: demandA } }),
        provider({ id: "reddit", priority: 18, confidence: 0.9, payload: { demand: demandA } }),
        provider({ id: "amazon", priority: 8, confidence: 0.9, payload: { demand: demandA } }),
      ],
    });

    assert.ok(
      many.dataQuality.confidence > one.dataQuality.confidence,
      "mehrere Quellen müssen mehr Vertrauen ergeben als eine",
    );
  });

  it("senkt die Konfidenz bei synthetischen Daten", async () => {
    const real = await collectSignals(QUERY, {
      now: NOW,
      providers: [
        provider({ id: "google-trends", priority: 20, confidence: 0.9, payload: { demand: demandA }, synthetic: false }),
      ],
    });

    const synthetic = await collectSignals(QUERY, {
      now: NOW,
      providers: [
        provider({ id: "google-trends", priority: 20, confidence: 0.9, payload: { demand: demandA }, synthetic: true }),
      ],
    });

    assert.equal(synthetic.dataQuality.syntheticShare, 1);
    assert.ok(synthetic.dataQuality.confidence < real.dataQuality.confidence);
  });

  it("weist die Abdeckung anhand der beitragenden Fähigkeiten aus", async () => {
    const narrow = await collectSignals(QUERY, {
      now: NOW,
      providers: [
        provider({
          id: "google-trends",
          priority: 20,
          confidence: 0.9,
          capabilities: ["demand"],
          payload: { demand: demandA },
        }),
      ],
    });

    // Eine von sieben auswertbaren Fähigkeiten (discovery zählt nicht mit).
    assert.ok(narrow.dataQuality.coverage < 0.2, `Abdeckung war ${narrow.dataQuality.coverage}`);
  });

  it("mittelt die Datenaktualität über die antwortenden Quellen", async () => {
    const signals = await collectSignals(QUERY, {
      now: NOW,
      providers: [
        provider({ id: "google-trends", priority: 20, confidence: 0.9, payload: { demand: demandA }, freshnessDays: 2 }),
        provider({ id: "etsy", priority: 10, confidence: 0.9, payload: { demand: demandA }, freshnessDays: 4 }),
      ],
    });

    assert.equal(signals.dataQuality.freshnessDays, 3);
  });
});

describe("collectSignals – Fähigkeitsfilter", () => {
  it("befragt nur Quellen mit den angeforderten Fähigkeiten", async () => {
    const signals = await collectSignals(QUERY, {
      now: NOW,
      capabilities: ["demand"],
      providers: [
        provider({
          id: "google-trends",
          priority: 20,
          confidence: 0.9,
          capabilities: ["demand"],
          payload: { demand: demandA },
        }),
        provider({
          id: "pinterest",
          priority: 15,
          confidence: 0.7,
          capabilities: ["design"],
          payload: { design: { palettes: [], typography: [], illustrationStyles: [], motifs: [], observations: [] } },
        }),
      ],
    });

    assert.equal(signals.sources.length, 1);
    assert.equal(signals.sources[0]?.source, "google-trends");
    assert.equal(signals.design, undefined);
  });
});
