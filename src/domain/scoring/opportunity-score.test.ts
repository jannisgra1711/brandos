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

  it("liefert einen neutralen Abstand, wenn kein Peak bekannt ist", () => {
    assert.equal(monthsUntilNextPeak(5, []), 6);
  });
});
