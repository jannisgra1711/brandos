import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  DataQuality,
  MarketSignals,
  OpportunityScore,
  TrendDirection,
} from "@/domain/types";
import { heuristicAnalyst } from "./heuristic-analyst";

/**
 * Die Heuristik erzeugt alles, was der Nutzer liest – Urteil, Erkenntnisse,
 * Risiken und Handlungsempfehlungen. Ohne API-Key ist sie nicht der
 * Ausweichweg, sondern der Normalfall.
 *
 * Abgesichert werden die Zusagen, die das Produkt glaubwürdig halten:
 *
 *   1. Keine Aussage ohne Signal. Fehlt ein Wert, wird das gesagt, nicht
 *      geraten.
 *   2. `demand.direction` ist maßgeblich. Kein Text darf ihr widersprechen.
 *   3. Deutsche Zahlformate durchgehend – ein englischer Dezimalpunkt in
 *      einem deutschen Satz verrät rohe `round()`-Werte.
 *   4. Optionale Signalfelder erzeugen keine kaputten Sätze und keine
 *      baumelnden Aufzählungen.
 */

const QUALITY: DataQuality = {
  coverage: 1,
  sourceCount: 6,
  syntheticShare: 0,
  confidence: 0.8,
  freshnessDays: 1,
};

function signals(overrides: Partial<MarketSignals> = {}): MarketSignals {
  return {
    query: { term: "Emaille Tasse", market: "DE" },
    collectedAt: "2026-07-25T00:00:00.000Z",
    sources: [],
    keywords: [],
    productTypes: [],
    dataQuality: QUALITY,
    ...overrides,
  };
}

function demand(overrides: Partial<NonNullable<MarketSignals["demand"]>> = {}) {
  return {
    volumeIndex: 62,
    estimatedMonthlySearches: 18_400,
    growth90d: 0.12,
    growth12m: 0.24,
    direction: "rising" as TrendDirection,
    series: [
      { period: "2026-05", value: 55 },
      { period: "2026-06", value: 60 },
      { period: "2026-07", value: 62 },
    ],
    ...overrides,
  };
}

function competition(
  overrides: Partial<NonNullable<MarketSignals["competition"]>> = {},
) {
  return {
    listingCount: 24_000,
    activeSellers: 5006,
    saturationIndex: 64.7,
    top10SharePct: 38,
    medianListingAgeDays: 545,
    newListings30dPct: 7.2,
    entryBarrier: "low" as const,
    ...overrides,
  };
}

function score(overrides: Partial<OpportunityScore> = {}): OpportunityScore {
  return {
    value: 61.4,
    grade: "B",
    confidence: 0.73,
    factors: [],
    drivers: ["Nachfrage: solide Ausgangslage."],
    drags: ["Wettbewerb: dicht besetzt."],
    ...overrides,
  };
}

/** Sammelt jeden vom Analysten erzeugten Fließtext. */
function allText(result: Awaited<ReturnType<typeof heuristicAnalyst.interpret>>): string[] {
  return [
    result.summary,
    result.verdict,
    ...result.opportunities,
    ...result.risks,
    ...result.recommendedActions,
    ...result.insights.flatMap((i) => [i.title, i.detail, ...i.evidence]),
    ...result.ideas.flatMap((idea) => [idea.title, idea.rationale, ...idea.risks]),
  ];
}

describe("heuristicAnalyst – Ergebnisform", () => {
  it("liefert eine vollständige Interpretation und weist sich als regelbasiert aus", async () => {
    const result = await heuristicAnalyst.interpret({
      signals: signals({ demand: demand(), competition: competition() }),
      score: score(),
    });

    assert.ok(result.summary.length > 0);
    assert.ok(result.verdict.length > 0);
    assert.ok(result.insights.length > 0);
    assert.ok(result.recommendedActions.length > 0);
    // `degraded` weist die Herkunft aus, statt sie zu verbergen.
    assert.equal(result.producedBy.analyst, "heuristic");
    assert.equal(result.producedBy.degraded, true);
  });

  it("erzeugt so viele Ideen wie angefordert", async () => {
    const result = await heuristicAnalyst.interpret({
      signals: signals({ demand: demand(), competition: competition() }),
      score: score(),
      ideaCount: 2,
    });
    assert.equal(result.ideas.length, 2);
  });

  it("jede Erkenntnis führt ihre Belege mit", async () => {
    const result = await heuristicAnalyst.interpret({
      signals: signals({ demand: demand(), competition: competition() }),
      score: score(),
    });

    for (const insight of result.insights) {
      assert.ok(insight.evidence.length > 0, `ohne Beleg: "${insight.title}"`);
      assert.ok(
        insight.confidence > 0 && insight.confidence <= 1,
        `Konfidenz außerhalb 0..1: ${insight.confidence}`,
      );
    }
  });

  it("lässt den Abschnitt der Maßnahmen nie leer", async () => {
    // Ohne Keywords, Saisonalität und Produktarten greift keine der
    // signalgebundenen Empfehlungen.
    const result = await heuristicAnalyst.interpret({
      signals: signals({ demand: demand(), competition: competition() }),
      score: score({ value: 61.4 }),
    });

    assert.ok(result.recommendedActions.length > 0);
    assert.match(result.recommendedActions[0] ?? "", /keine spezifische Maßnahme/);
  });

  it("behauptet nichts, wenn gar keine Signale vorliegen", async () => {
    const result = await heuristicAnalyst.interpret({
      signals: signals(),
      score: score({ value: 50, drivers: [], drags: [] }),
    });

    assert.match(result.summary, /keine belastbaren Nachfragedaten/);
    assert.deepEqual(result.opportunities, ["Keine ausgeprägten Stärken erkennbar."]);
    assert.deepEqual(result.risks, ["Keine ausgeprägten Schwächen erkennbar."]);
  });
});

describe("heuristicAnalyst – Trendkonsistenz", () => {
  const cases: [TrendDirection, RegExp][] = [
    ["rising", /zieht an/],
    ["declining", /lässt nach/],
    ["volatile", /Schwankende/],
    ["stable", /Stabile/],
  ];

  for (const [direction, expected] of cases) {
    it(`folgt der Richtung "${direction}" statt einer einzelnen Wachstumsrate`, async () => {
      const result = await heuristicAnalyst.interpret({
        signals: signals({ demand: demand({ direction }) }),
        score: score(),
      });

      const trendInsight = result.insights.find((i) => expected.test(i.title));
      assert.ok(
        trendInsight,
        `kein passender Insight für ${direction}: ${result.insights.map((i) => i.title).join(", ")}`,
      );
    });
  }

  it("benennt gegenläufige Zeiträume als eigene Erkenntnis", async () => {
    const result = await heuristicAnalyst.interpret({
      // Kurzfrist positiv, Langfrist negativ – der Widerspruch ist die Aussage.
      signals: signals({ demand: demand({ growth90d: 0.15, growth12m: -0.3, direction: "declining" }) }),
      score: score(),
    });

    const diverging = result.insights.find((i) => /Erholung im Abwärtstrend/.test(i.title));
    assert.ok(diverging, "der Widerspruch muss benannt werden, nicht geglättet");
  });

  it("wiederholt den Widerspruch nicht, wenn die Richtung ihn bereits ausdrückt", async () => {
    const result = await heuristicAnalyst.interpret({
      signals: signals({ demand: demand({ growth90d: 0.4, growth12m: -0.4, direction: "volatile" }) }),
      score: score(),
    });

    const diverging = result.insights.filter((i) => /Delle|Erholung/.test(i.title));
    assert.equal(diverging.length, 0, "die Richtung „volatil“ sagt es bereits");
  });
});

describe("heuristicAnalyst – fehlende Signalfelder", () => {
  it("nennt den Nachfrageindex, wenn kein absolutes Volumen vorliegt", async () => {
    const result = await heuristicAnalyst.interpret({
      signals: signals({ demand: demand({ estimatedMonthlySearches: undefined }) }),
      score: score(),
    });

    assert.match(result.summary, /Nachfrageindex von 62\/100/);
    assert.ok(
      !/undefined|NaN/.test(result.summary),
      `kaputter Satz: ${result.summary}`,
    );
  });

  it("bleibt ohne Sättigungswert grammatisch heil", async () => {
    const result = await heuristicAnalyst.interpret({
      signals: signals({
        demand: demand(),
        competition: competition({ saturationIndex: undefined }),
      }),
      score: score(),
    });

    assert.match(result.summary, /Listings; die Top 10 halten/);
    assert.ok(!/undefined|NaN|\s{2,}/.test(result.summary), `kaputter Satz: ${result.summary}`);

    // Der Beleg darf keine leere Sättigungszeile führen.
    const wettbewerb = result.insights.find((i) => /Wettbewerb|dicht besetzt/.test(i.title));
    assert.ok(!wettbewerb?.evidence.some((e) => /Sättigung: \s*\/100/.test(e)));
  });

  it("lässt ohne Sättigungswert den Top-10-Anteil entscheiden", async () => {
    const crowded = await heuristicAnalyst.interpret({
      signals: signals({
        competition: competition({ saturationIndex: undefined, top10SharePct: 55 }),
      }),
      score: score(),
    });
    const open = await heuristicAnalyst.interpret({
      signals: signals({
        competition: competition({ saturationIndex: undefined, top10SharePct: 12 }),
      }),
      score: score(),
    });

    assert.ok(crowded.insights.some((i) => /dicht besetzt/.test(i.title)));
    assert.ok(open.insights.some((i) => /lässt Raum/.test(i.title)));
  });

  it("behauptet kein junges Bestandsangebot ohne Altersangabe", async () => {
    const result = await heuristicAnalyst.interpret({
      signals: signals({
        competition: competition({ medianListingAgeDays: undefined }),
      }),
      score: score(),
    });

    assert.ok(
      !result.insights.some((i) => /Junges Bestandsangebot/.test(i.title)),
      "ohne Alter darf keine Aussage über das Alter entstehen",
    );
  });

  it("führt keine leere Treiberzeile, wenn die Quelle keine Anlässe kennt", async () => {
    const result = await heuristicAnalyst.interpret({
      signals: signals({
        demand: demand(),
        seasonality: {
          amplitude: 0.45,
          monthlyIndex: [0.6, 0.6, 0.8, 0.9, 1, 1.1, 1.2, 1.2, 1.1, 1.2, 1.5, 1.6],
          peakMonths: [11, 12],
          lowMonths: [1, 2],
          // Google Trends erklärt nicht, *warum* ein Monat heraussticht.
          drivers: [],
        },
      }),
      score: score(),
    });

    const timing = result.insights.find((i) => i.kind === "timing");
    assert.ok(timing, "der Timing-Insight muss entstehen");
    assert.ok(
      !timing.evidence.some((e) => /^Treiber:\s*$/.test(e.trim())),
      `baumelnde Aufzählung: ${JSON.stringify(timing.evidence)}`,
    );
  });
});

describe("heuristicAnalyst – Urteil und Warnungen", () => {
  const thresholds: [number, RegExp][] = [
    [82, /Klare Chance/],
    [64, /Tragfähiger Markt/],
    [50, /Grenzfall/],
    [20, /Zurückhaltung/],
  ];

  for (const [value, expected] of thresholds) {
    it(`urteilt bei Score ${value} entsprechend`, async () => {
      const result = await heuristicAnalyst.interpret({
        signals: signals({ demand: demand() }),
        score: score({ value }),
      });
      assert.match(result.verdict, expected);
    });
  }

  it("weist überwiegend synthetische Daten im Urteil aus", async () => {
    const result = await heuristicAnalyst.interpret({
      signals: signals({
        demand: demand(),
        dataQuality: { ...QUALITY, syntheticShare: 0.71 },
      }),
      score: score(),
    });

    assert.match(result.verdict, /synthetische Daten/);
    assert.ok(
      result.recommendedActions.some((a) => /Echte Datenquellen anbinden/.test(a)),
      "und empfiehlt, sie zu ersetzen",
    );
  });

  it("warnt bei dünner Datengrundlage", async () => {
    const result = await heuristicAnalyst.interpret({
      signals: signals({
        demand: demand(),
        dataQuality: { ...QUALITY, confidence: 0.4, sourceCount: 2, coverage: 0.3 },
      }),
      score: score(),
    });

    const warning = result.insights.find((i) => /Eingeschränkte Datengrundlage/.test(i.title));
    assert.ok(warning, "eine dünne Grundlage muss benannt werden");
  });
});

describe("heuristicAnalyst – deutsche Sprache", () => {
  /**
   * Rohe `round()`-Werte erzeugen englische Dezimalpunkte. Der Test sucht
   * eine Ziffer, gefolgt von Punkt und Ziffer – „62.5" schlägt an, „24.000"
   * als Tausendertrennung und „2026-07" als Zeitraum nicht.
   */
  const ENGLISH_DECIMAL = /\d+\.\d(?!\d\d)/;

  it("schreibt Zahlen durchgehend mit Dezimalkomma", async () => {
    const result = await heuristicAnalyst.interpret({
      signals: signals({
        demand: demand({ volumeIndex: 62.4, growth90d: 0.123, growth12m: 0.247 }),
        competition: competition({ saturationIndex: 64.7, top10SharePct: 38.2 }),
        seasonality: {
          amplitude: 0.455,
          monthlyIndex: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.5, 1.6],
          peakMonths: [11, 12],
          lowMonths: [1],
          drivers: ["Weihnachten"],
        },
        keywords: [
          { term: "Emaille Tasse Camping", volumeIndex: 41.5, growth90d: 0.62, competition: 33.4, rising: true },
        ],
        productTypes: [{ type: "Tasse", share: 0.42, medianPrice: 17.5, growth90d: 0.1 }],
      }),
      score: score({ value: 61.45, confidence: 0.734 }),
    });

    for (const text of allText(result)) {
      assert.ok(
        !ENGLISH_DECIMAL.test(text),
        `englischer Dezimalpunkt in: "${text}"`,
      );
    }
  });

  it("lässt deutsche Substantive großgeschrieben", async () => {
    const result = await heuristicAnalyst.interpret({
      signals: signals({
        demand: demand(),
        productTypes: [{ type: "Emaille Becher", share: 0.5, medianPrice: 20, growth90d: 0.1 }],
        keywords: [
          { term: "Emaille Becher Camping", volumeIndex: 40, growth90d: 0.5, competition: 30, rising: true },
        ],
      }),
      score: score(),
    });

    const joined = allText(result).join(" ");
    assert.ok(
      !/emaille becher/.test(joined),
      "toLowerCase() auf deutschem Text zerstört die Substantive",
    );
  });
});
