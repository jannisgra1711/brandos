import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MarketSignals } from "@/domain/types";
import { monthsUntilNextPeak, scoreOpportunity } from "./opportunity-score";

/**
 * Der Opportunity Score ist die Zahl, auf die Nutzer Investitionsentscheidungen
 * stuetzen. Diese Tests sichern die Eigenschaften, die dafuer gelten muessen:
 * Reproduzierbarkeit, Erklaerbarkeit und ehrlicher Umgang mit Datenluecken.
 */

function signals(overrides: Partial<MarketSignals> = {}): MarketSignals {
  return {
    query: { term: "Test", market: "DE" },
    collectedAt: "2026-03-01T00:00:00.000Z",
    sources: [],
    keywords: [],
    productTypes: [],
    dataQuality: {
      coverage: 1,
      sourceCount: 5,
      syntheticShare: 0,
      freshnessDays: 1,
      confidence: 0.9,
    },
    ...overrides,
  };
}

const strongDemand = {
  volumeIndex: 82,
  estimatedMonthlySearches: 120_000,
  growth90d: 0.34,
  growth12m: 0.51,
  direction: "rising" as const,
  series: [],
};

const openCompetition = {
  listingCount: 4200,
  activeSellers: 480,
  saturationIndex: 32,
  top10SharePct: 14,
  medianListingAgeDays: 210,
  newListings30dPct: 8,
  entryBarrier: "low" as const,
};

const crowdedCompetition = {
  ...openCompetition,
  listingCount: 180_000,
  saturationIndex: 93,
  top10SharePct: 55,
  medianListingAgeDays: 1300,
  newListings30dPct: 31,
  entryBarrier: "high" as const,
};

describe("scoreOpportunity", () => {
  it("ist deterministisch – gleiche Eingabe, gleiches Ergebnis", () => {
    const input = signals({ demand: strongDemand, competition: openCompetition });
    const now = new Date("2026-03-01T00:00:00.000Z");

    const first = scoreOpportunity(input, { now });
    const second = scoreOpportunity(input, { now });

    assert.deepEqual(first, second);
  });

  it("bewertet einen wachsenden, offenen Markt besser als einen gesättigten", () => {
    const now = new Date("2026-03-01T00:00:00.000Z");

    const open = scoreOpportunity(
      signals({ demand: strongDemand, competition: openCompetition }),
      { now },
    );
    const crowded = scoreOpportunity(
      signals({ demand: strongDemand, competition: crowdedCompetition }),
      { now },
    );

    assert.ok(
      open.value > crowded.value,
      `offener Markt (${open.value}) muss über gesättigtem (${crowded.value}) liegen`,
    );
  });

  it("gewichtet alle Faktoren zusammen zu genau 1", () => {
    const score = scoreOpportunity(signals({ demand: strongDemand }));
    const total = score.factors.reduce((sum, factor) => sum + factor.weight, 0);

    assert.ok(Math.abs(total - 1) < 0.0001, `Summe der Gewichte war ${total}`);
  });

  it("begründet jeden Faktor", () => {
    const score = scoreOpportunity(signals({ demand: strongDemand }));

    for (const factor of score.factors) {
      assert.ok(factor.rationale.length > 0, `${factor.key} ohne Begründung`);
    }
  });

  it("markiert fehlende Signale als geschätzt und senkt dadurch die Konfidenz", () => {
    const complete = scoreOpportunity(
      signals({ demand: strongDemand, competition: openCompetition }),
    );
    const sparse = scoreOpportunity(signals());

    assert.ok(sparse.factors.every((factor) => factor.imputed));
    assert.ok(
      sparse.confidence < complete.confidence,
      "dünne Datenlage muss die Konfidenz senken",
    );
  });

  it("nennt geschätzte Faktoren weder als Treiber noch als Bremse", () => {
    const score = scoreOpportunity(signals());

    // Ohne Daten darf das System keine inhaltliche Aussage behaupten.
    assert.equal(score.drivers.length, 0);
    assert.equal(score.drags.length, 0);
  });

  it("vergibt Noten entlang der Score-Schwellen", () => {
    const grades = [
      scoreOpportunity(signals({ demand: strongDemand, competition: openCompetition })).grade,
      scoreOpportunity(signals({ demand: strongDemand, competition: crowdedCompetition })).grade,
    ];

    assert.ok(grades.every((grade) => ["A", "B", "C", "D"].includes(grade)));
  });
});

describe("monthsUntilNextPeak", () => {
  it("misst den Abstand vorwärts über den Jahreswechsel hinweg", () => {
    assert.equal(monthsUntilNextPeak(11, [1]), 2);
    assert.equal(monthsUntilNextPeak(3, [3]), 0);
    assert.equal(monthsUntilNextPeak(1, [11, 12]), 10);
  });

  it("wählt bei mehreren Peaks den nächstgelegenen, nicht den ersten", () => {
    // Von Juli aus ist September (2 Monate) näher als Januar (6 Monate).
    assert.equal(monthsUntilNextPeak(7, [1, 9]), 2);
    assert.equal(monthsUntilNextPeak(7, [5, 11]), 4);
  });

  it("liefert einen neutralen Abstand, wenn kein Peak bekannt ist", () => {
    assert.equal(monthsUntilNextPeak(5, []), 6);
  });
});

describe("Auflösung des nächsten Peak-Monats", () => {
  // Spiegelt die Berechnung in discovery-service.scanSeed: Aus Abstand und
  // aktuellem Monat muss derselbe Peak herauskommen, der den Abstand erzeugt
  // hat. Bei mehreren Peaks ist das nicht peakMonths[0] – genau dort entstand
  // vorher eine falsche Anzeige ("Peak in 2 Monaten (Januar)" im Juli).
  const nextPeakMonth = (currentMonth: number, peakMonths: number[]) =>
    ((currentMonth - 1 + monthsUntilNextPeak(currentMonth, peakMonths)) % 12) + 1;

  it("zeigt auf einen tatsächlichen Peak-Monat", () => {
    for (const currentMonth of [1, 4, 7, 10, 12]) {
      for (const peaks of [[1, 9], [5, 11], [3], [11, 12], [6, 7]]) {
        const resolved = nextPeakMonth(currentMonth, peaks);
        assert.ok(
          peaks.includes(resolved),
          `Monat ${currentMonth} mit Peaks ${peaks} ergab ${resolved} – kein Peak-Monat`,
        );
      }
    }
  });

  it("löst über den Jahreswechsel korrekt auf", () => {
    assert.equal(nextPeakMonth(11, [1]), 1);
    assert.equal(nextPeakMonth(7, [1, 9]), 9);
    assert.equal(nextPeakMonth(7, [6, 7]), 7);
  });
});

/**
 * Die Herkunft eines Faktors ist der Unterschied zwischen "gemessen" und
 * "plausibel erzeugt". Ohne sie sieht ein Faktor aus einem Mock exakt aus
 * wie einer aus Google Trends – gleicher Balken, gleiche Begruendung.
 */
describe("scoreOpportunity – Herkunft der Faktoren", () => {
  const audience = {
    segments: [],
    motives: [{ label: "Identitaet", kind: "identity" as const, weight: 1 }],
    giftPotential: 70,
    emotionalIntensity: 65,
  };

  /** Summe der Gewichte der genannten Faktoren – unabhaengig von der Gewichtstabelle. */
  function weightOf(score: ReturnType<typeof scoreOpportunity>, keys: string[]): number {
    const sum = score.factors
      .filter((f) => keys.includes(f.key))
      .reduce((total, f) => total + f.weight, 0);
    return Math.round(sum * 1000) / 1000;
  }

  it("nennt je Faktor die Quellen des zugrunde liegenden Signals", () => {
    const score = scoreOpportunity(
      signals({
        demand: strongDemand,
        competition: openCompetition,
        provenance: {
          demand: { sources: ["google-trends", "tiktok"], syntheticShare: 0 },
          competition: { sources: ["ebay"], syntheticShare: 0 },
        },
      }),
    );

    const byKey = new Map(score.factors.map((f) => [f.key, f]));
    // Nachfrage und Trend lesen dasselbe Signal, also dieselbe Herkunft.
    assert.deepEqual(byKey.get("demand")?.sources, ["google-trends", "tiktok"]);
    assert.deepEqual(byKey.get("trend")?.sources, ["google-trends", "tiktok"]);
    assert.deepEqual(byKey.get("competition")?.sources, ["ebay"]);
  });

  it("gibt einem geschaetzten Faktor keine Quelle", () => {
    const score = scoreOpportunity(
      signals({
        demand: strongDemand,
        provenance: { demand: { sources: ["google-trends"], syntheticShare: 0 } },
      }),
    );

    const gift = score.factors.find((f) => f.key === "giftPotential");
    assert.equal(gift?.imputed, true);
    assert.deepEqual(gift?.sources, []);
    assert.equal(gift?.syntheticShare, undefined);
  });

  it("gibt auch dann keine Quelle an, wenn das Signal vorlag, der Faktor aber aufgab", () => {
    const score = scoreOpportunity(
      signals({
        // Wettbewerb ist da, aber ohne Alter und Neuzugaenge - marketAge gibt auf.
        competition: { listingCount: 4200, top10SharePct: 14, entryBarrier: "low" },
        provenance: { competition: { sources: ["ebay"], syntheticShare: 0 } },
      }),
    );

    const byKey = new Map(score.factors.map((f) => [f.key, f]));
    assert.equal(byKey.get("competition")?.imputed, false);
    assert.deepEqual(byKey.get("competition")?.sources, ["ebay"]);

    // Derselbe Signalblock, aber dieser Faktor beruht auf nichts.
    assert.equal(byKey.get("marketAge")?.imputed, true);
    assert.deepEqual(byKey.get("marketAge")?.sources, []);
  });

  it("gewichtet den synthetischen Anteil mit dem Einfluss auf den Score", () => {
    const score = scoreOpportunity(
      signals({
        demand: strongDemand,
        competition: openCompetition,
        audience,
        provenance: {
          demand: { sources: ["google-trends"], syntheticShare: 0 },
          competition: { sources: ["ebay"], syntheticShare: 0 },
          audience: { sources: ["reddit"], syntheticShare: 1 },
        },
      }),
    );

    // Genau die beiden Faktoren, die aus `audience` entstehen - nicht
    // "eine von drei Quellen ist synthetisch".
    assert.equal(score.syntheticWeight, weightOf(score, ["giftPotential", "emotionalPull"]));
  });

  it("meldet null, wenn jede beitragende Quelle echt ist", () => {
    const score = scoreOpportunity(
      signals({
        demand: strongDemand,
        provenance: { demand: { sources: ["google-trends"], syntheticShare: 0 } },
      }),
    );

    assert.equal(score.syntheticWeight, 0);
  });

  it("laesst den Anteil offen, wenn die Signale keine Herkunft mitbringen", () => {
    const score = scoreOpportunity(signals({ demand: strongDemand, competition: openCompetition }));

    // Eine 0 waere hier die gefaehrlichste Antwort: Sie laese sich als
    // "nichts davon ist synthetisch", obwohl niemand nachgehalten hat.
    assert.equal(score.syntheticWeight, undefined);
    assert.deepEqual(score.factors[0]?.sources, []);
  });

  it("beruecksichtigt einen teilweise synthetischen Beitrag anteilig", () => {
    const full = scoreOpportunity(
      signals({
        demand: strongDemand,
        provenance: { demand: { sources: ["tiktok"], syntheticShare: 1 } },
      }),
    );
    const half = scoreOpportunity(
      signals({
        demand: strongDemand,
        provenance: { demand: { sources: ["google-trends", "tiktok"], syntheticShare: 0.5 } },
      }),
    );

    assert.ok(half.syntheticWeight !== undefined && full.syntheticWeight !== undefined);
    assert.ok(half.syntheticWeight < full.syntheticWeight);
    assert.equal(half.syntheticWeight, Math.round(full.syntheticWeight * 500) / 1000);
  });
});

/**
 * Die Konfidenz beantwortet: Wie sehr traegt diese Zahl? Dafuer zaehlt, wie
 * viel *Gewicht* auf Erfundenem oder Geschaetztem beruht - nicht, wie viele
 * Quellen geantwortet haben.
 */
describe("scoreOpportunity – Konfidenz nach Gewicht", () => {
  const audience = {
    segments: [],
    motives: [{ label: "Identitaet", kind: "identity" as const, weight: 1 }],
    giftPotential: 70,
    emotionalIntensity: 65,
  };

  const full = {
    demand: strongDemand,
    competition: openCompetition,
    audience,
  };

  it("senkt die Konfidenz, wenn ein Signal synthetisch ist", () => {
    const measured = scoreOpportunity(
      signals({
        ...full,
        provenance: {
          demand: { sources: ["google-trends"], syntheticShare: 0 },
          competition: { sources: ["etsy"], syntheticShare: 0 },
          audience: { sources: ["reddit"], syntheticShare: 0 },
        },
      }),
    );

    const partlySynthetic = scoreOpportunity(
      signals({
        ...full,
        provenance: {
          demand: { sources: ["google-trends"], syntheticShare: 0 },
          competition: { sources: ["etsy"], syntheticShare: 0 },
          audience: { sources: ["reddit"], syntheticShare: 1 },
        },
      }),
    );

    assert.ok(
      partlySynthetic.confidence < measured.confidence,
      `${partlySynthetic.confidence} sollte unter ${measured.confidence} liegen`,
    );
    // Der Score selbst bleibt unberuehrt - fehlende Echtheit ist
    // Unsicherheit, keine schlechte Nachricht.
    assert.equal(partlySynthetic.value, measured.value);
  });

  it("gewichtet die Strafe mit dem Einfluss des Signals", () => {
    const build = (key: "demand" | "audience") =>
      scoreOpportunity(
        signals({
          ...full,
          provenance: {
            demand: { sources: ["google-trends"], syntheticShare: key === "demand" ? 1 : 0 },
            competition: { sources: ["etsy"], syntheticShare: 0 },
            audience: { sources: ["reddit"], syntheticShare: key === "audience" ? 1 : 0 },
          },
        }),
      );

    // Nachfrage und Trend tragen zusammen mehr Gewicht als Geschenkpotenzial
    // und Emotionale Bindung - eine synthetische Nachfrage muss also staerker
    // durchschlagen als eine synthetische Zielgruppe.
    assert.ok(
      build("demand").confidence < build("audience").confidence,
      "die Strafe folgt nicht dem Gewicht",
    );
  });

  it("faellt auf die Quellenquote zurueck, wenn keine Herkunft vorliegt", () => {
    const withoutProvenance = scoreOpportunity(
      signals({ ...full, dataQuality: { coverage: 1, sourceCount: 3, syntheticShare: 1, freshnessDays: 1, confidence: 0.9 } }),
    );
    const measuredSources = scoreOpportunity(
      signals({ ...full, dataQuality: { coverage: 1, sourceCount: 3, syntheticShare: 0, freshnessDays: 1, confidence: 0.9 } }),
    );

    // Ohne Herkunft ist die grobe Quote das einzige Mass - besser als gar
    // keine Vorsicht bei Analysen aus der Zeit davor.
    assert.ok(withoutProvenance.confidence < measuredSources.confidence);
  });
});

describe("scoreCompetition – Grundlage der abgeleiteten Saettigung", () => {
  const partial = { listingCount: 243, top10SharePct: 30, entryBarrier: "low" as const };

  it("leitet aus der breitesten Trefferzahl ab, nicht aus der des Leitmarkts", () => {
    const narrow = scoreOpportunity(signals({ competition: partial }));
    const broad = scoreOpportunity(signals({ competition: { ...partial, marketListingCount: 25_000 } }));

    const factor = (s: ReturnType<typeof scoreOpportunity>) =>
      s.factors.find((f) => f.key === "competition");

    // Ein Markt mit 25.000 Angeboten ist enger als einer mit 243 - der
    // Wettbewerbsfaktor muss darauf reagieren.
    assert.ok(
      (factor(broad)?.value ?? 0) < (factor(narrow)?.value ?? 0),
      "die breitere Trefferzahl blieb ohne Wirkung",
    );
  });

  it("sagt im Begruendungstext, worauf die Ableitung beruht", () => {
    const broad = scoreOpportunity(signals({ competition: { ...partial, marketListingCount: 25_000 } }));
    const rationale = broad.factors.find((f) => f.key === "competition")?.rationale ?? "";

    // Sonst steht eine Saettigung neben einer Listing-Zahl, aus der sie
    // erkennbar nicht stammt.
    assert.match(rationale, /über alle Marktplätze/);
    assert.match(rationale, /243 Listings/);
  });

  it("nennt keine Marktplaetze, wenn beide Zahlen uebereinstimmen", () => {
    const same = scoreOpportunity(
      signals({ competition: { ...partial, marketListingCount: 243 } }),
    );
    const rationale = same.factors.find((f) => f.key === "competition")?.rationale ?? "";

    assert.match(rationale, /aus der Listing-Zahl abgeleitet/);
    assert.doesNotMatch(rationale, /über alle Marktplätze/);
  });

  it("ruehrt eine gemeldete Saettigung nicht an", () => {
    const reported = scoreOpportunity(
      signals({ competition: { ...partial, saturationIndex: 64, marketListingCount: 25_000 } }),
    );
    const rationale = reported.factors.find((f) => f.key === "competition")?.rationale ?? "";

    assert.match(rationale, /Sättigung 64\/100 bei/);
    assert.doesNotMatch(rationale, /abgeleitet/);
  });
});
