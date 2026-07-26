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

  it("mischt Bewertungen nur über Quellen, die sie kennen", async () => {
    const signals = await collectSignals(QUERY, {
      now: NOW,
      providers: [
        provider({
          id: "etsy",
          priority: 10,
          confidence: 1,
          payload: {
            pricing: { currency: "EUR", min: 10, p25: 20, median: 30, p75: 40, max: 50, avgReviewsPerListing: 8 },
          },
        }),
        provider({
          id: "ebay",
          priority: 12,
          confidence: 1,
          payload: {
            // eBay weist Verkäuferbewertungen aus, nicht Listing-Bewertungen –
            // und lässt das Feld deshalb leer.
            pricing: { currency: "EUR", min: 10, p25: 20, median: 30, p75: 40, max: 50 },
          },
        }),
      ],
    });

    // Die unwissende Quelle darf den Wert nicht gegen null ziehen.
    assert.equal(signals.pricing?.avgReviewsPerListing, 8);
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

/**
 * Echte Marktplatzquellen liefern nur einen Teil des Wettbewerbsbildes: Eine
 * Suchergebnisliste kennt ihre Trefferzahl, aber weder das Alter der Listings
 * noch die Anbieterzahl jenseits der sichtbaren Seiten. Der Aggregator muss
 * solche Teilbeiträge mit vollständigen zusammenführen, ohne die Lücken mit
 * Nullen zu füllen – eine Sättigung von 0 läse sich als unbesetzter Markt.
 */
describe("collectSignals – unvollständige Wettbewerbsquellen", () => {
  /** Eine Quelle nach Art von eBay: Trefferzahl und Konzentration, sonst nichts. */
  const partial = {
    listingCount: 24_000,
    top10SharePct: 38,
    entryBarrier: "low" as const,
  };

  /** Eine Quelle nach Art des Etsy-Mocks: alle Felder belegt. */
  const complete = {
    listingCount: 8_000,
    activeSellers: 5_006,
    saturationIndex: 64,
    top10SharePct: 30,
    medianListingAgeDays: 545,
    newListings30dPct: 7.2,
    entryBarrier: "medium" as const,
  };

  it("lässt leer, was keine Quelle kennt – statt null einzusetzen", async () => {
    const signals = await collectSignals(QUERY, {
      now: NOW,
      providers: [provider({ id: "ebay", priority: 12, confidence: 0.9, payload: { competition: partial } })],
    });

    assert.equal(signals.competition?.listingCount, 24_000);
    assert.equal(signals.competition?.top10SharePct, 38);

    // Der entscheidende Teil: kein Wert, keine Zahl.
    assert.equal(signals.competition?.saturationIndex, undefined, "Sättigung wurde erfunden");
    assert.equal(signals.competition?.activeSellers, undefined, "Anbieterzahl wurde erfunden");
    assert.equal(signals.competition?.medianListingAgeDays, undefined, "Listing-Alter wurde erfunden");
    assert.equal(signals.competition?.newListings30dPct, undefined, "Neuzugänge wurden erfunden");
  });

  it("füllt fehlende Felder aus der Quelle, die sie kennt", async () => {
    const signals = await collectSignals(QUERY, {
      now: NOW,
      providers: [
        provider({ id: "ebay", priority: 12, confidence: 0.9, payload: { competition: partial } }),
        provider({ id: "etsy", priority: 10, confidence: 0.9, payload: { competition: complete } }),
      ],
    });

    // Die Trefferzahl kommt vom Leitmarkt – Listing-Zahlen verschiedener
    // Marktplätze zu mitteln ergäbe eine Zahl, die es nirgends gibt.
    assert.equal(signals.competition?.listingCount, 24_000);
    // Die Lücken schließt die andere Quelle.
    assert.equal(signals.competition?.saturationIndex, 64);
    assert.equal(signals.competition?.activeSellers, 5_006);
    assert.equal(signals.competition?.medianListingAgeDays, 545);
  });

  it("zieht einen bekannten Wert nicht gegen null, wenn eine Quelle schweigt", async () => {
    const signals = await collectSignals(QUERY, {
      now: NOW,
      providers: [
        // Die schweigende Quelle wiegt schwerer – sie darf trotzdem nichts
        // beitragen, wo sie nichts weiß.
        provider({ id: "ebay", priority: 20, confidence: 1, payload: { competition: partial } }),
        provider({ id: "etsy", priority: 5, confidence: 1, payload: { competition: complete } }),
      ],
    });

    assert.equal(
      signals.competition?.saturationIndex,
      64,
      "der einzige bekannte Wert muss unverändert durchkommen",
    );
  });

  it("mischt gewichtet, sobald mehrere Quellen denselben Wert kennen", async () => {
    const signals = await collectSignals(QUERY, {
      now: NOW,
      providers: [
        provider({
          id: "etsy",
          priority: 10,
          confidence: 1,
          payload: { competition: { ...complete, saturationIndex: 60 } },
        }),
        provider({
          id: "amazon",
          priority: 10,
          confidence: 1,
          payload: { competition: { ...complete, saturationIndex: 80 } },
        }),
      ],
    });

    // Gleiches Gewicht → exaktes Mittel.
    assert.equal(signals.competition?.saturationIndex, 70);
  });

  it("übernimmt die Einstiegshürde vom Leitmarkt, statt sie zu mitteln", async () => {
    const signals = await collectSignals(QUERY, {
      now: NOW,
      providers: [
        provider({ id: "ebay", priority: 12, confidence: 0.9, payload: { competition: partial } }),
        provider({ id: "etsy", priority: 10, confidence: 0.9, payload: { competition: complete } }),
      ],
    });

    // "low" und "medium" haben keine sinnvolle Mitte.
    assert.equal(signals.competition?.entryBarrier, "low");
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

/**
 * Die Herkunft eines Signals ist die Grundlage dafür, dass ein erfundener
 * Wert in der Oberfläche nicht wie ein gemessener aussieht. `sources` allein
 * genügt dafür nicht: Es sagt, wer befragt wurde, nicht wer den einzelnen
 * Wert getragen hat.
 */
describe("collectSignals – Herkunft der Signale", () => {
  it("hält fest, welche Quellen ein Signal getragen haben", async () => {
    const signals = await collectSignals(QUERY, {
      now: NOW,
      providers: [
        provider({ id: "tiktok", priority: 6, confidence: 0.5, payload: { demand: demandB } }),
        provider({ id: "google-trends", priority: 20, confidence: 0.9, payload: { demand: demandA } }),
      ],
    });

    // Stärkster Beitrag zuerst – dieselbe Rangfolge, die den Wert bestimmt hat.
    assert.deepEqual(signals.provenance?.demand?.sources, ["google-trends", "tiktok"]);
  });

  it("nennt kein Signal, das keine Quelle getragen hat", async () => {
    const signals = await collectSignals(QUERY, {
      now: NOW,
      providers: [provider({ id: "google-trends", priority: 20, confidence: 0.9, payload: { demand: demandA } })],
    });

    assert.ok(signals.provenance?.demand);
    assert.equal(signals.provenance?.competition, undefined);
    assert.equal(signals.provenance?.audience, undefined);
  });

  it("zählt eine gescheiterte Quelle nicht als Beitrag", async () => {
    const signals = await collectSignals(QUERY, {
      now: NOW,
      providers: [
        provider({ id: "google-trends", priority: 20, confidence: 0.9, payload: { demand: demandA } }),
        failingProvider("etsy"),
      ],
    });

    assert.deepEqual(signals.provenance?.demand?.sources, ["google-trends"]);
  });

  it("wertet eine leere Liste nicht als Beitrag", async () => {
    const signals = await collectSignals(QUERY, {
      now: NOW,
      providers: [
        provider({
          id: "reddit",
          priority: 18,
          confidence: 0.7,
          capabilities: ["keywords"],
          // Die Quelle hat geantwortet, aber zum Ergebnis nichts gesagt.
          payload: { keywords: [] },
        }),
      ],
    });

    assert.equal(signals.provenance?.keywords, undefined);
  });

  it("weist eine rein echte Quelle als nicht synthetisch aus", async () => {
    const signals = await collectSignals(QUERY, {
      now: NOW,
      providers: [
        provider({ id: "google-trends", priority: 20, confidence: 0.9, payload: { demand: demandA }, synthetic: false }),
      ],
    });

    assert.equal(signals.provenance?.demand?.syntheticShare, 0);
  });

  it("weist eine rein synthetische Quelle vollständig als solche aus", async () => {
    const signals = await collectSignals(QUERY, {
      now: NOW,
      providers: [
        provider({ id: "tiktok", priority: 6, confidence: 0.5, payload: { demand: demandA }, synthetic: true }),
      ],
    });

    assert.equal(signals.provenance?.demand?.syntheticShare, 1);
  });

  it("gewichtet den synthetischen Anteil, statt Quellen zu zählen", async () => {
    const signals = await collectSignals(QUERY, {
      now: NOW,
      providers: [
        // Gewicht 18 – echt.
        provider({ id: "google-trends", priority: 20, confidence: 0.9, payload: { demand: demandA }, synthetic: false }),
        // Gewicht 3 – synthetisch.
        provider({ id: "tiktok", priority: 6, confidence: 0.5, payload: { demand: demandB }, synthetic: true }),
      ],
    });

    // Gezählt wäre die Hälfte synthetisch. Gewichtet sind es 3 von 21 –
    // die schwache Mock-Quelle hat den Wert kaum bewegt.
    assert.equal(signals.provenance?.demand?.syntheticShare, 0.14);
  });

  it("hält die Herkunft je Signal getrennt", async () => {
    const signals = await collectSignals(QUERY, {
      now: NOW,
      providers: [
        provider({
          id: "google-trends",
          priority: 20,
          confidence: 0.9,
          capabilities: ["demand"],
          payload: { demand: demandA },
          synthetic: false,
        }),
        provider({
          id: "etsy",
          priority: 10,
          confidence: 0.9,
          capabilities: ["competition"],
          payload: { competition: { listingCount: 8000, top10SharePct: 30, entryBarrier: "medium" } },
          synthetic: true,
        }),
      ],
    });

    // Der eigentliche Zweck: Ein Lauf ist nicht pauschal echt oder synthetisch.
    assert.equal(signals.provenance?.demand?.syntheticShare, 0);
    assert.equal(signals.provenance?.competition?.syntheticShare, 1);
  });
});
