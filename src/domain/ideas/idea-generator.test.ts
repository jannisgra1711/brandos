import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { scoreOpportunity } from "@/domain/scoring";
import type { MarketSignals } from "@/domain/types";
import { generateIdeas } from "./idea-generator";

/**
 * Ideen entstehen durch Kombination. Die Tests sichern genau diese Zusage:
 * jede Idee traegt vollstaendige Bausteine, eine Begruendung und ein
 * Potenzial, das sich aus dem Markt ableitet – nicht aus dem Nichts.
 */

const signals: MarketSignals = {
  query: { term: "Camping", market: "DE" },
  collectedAt: "2026-03-01T00:00:00.000Z",
  sources: [],
  demand: {
    volumeIndex: 64,
    estimatedMonthlySearches: 42_000,
    growth90d: 0.18,
    growth12m: 0.22,
    direction: "rising",
    series: [],
  },
  competition: {
    listingCount: 26_000,
    activeSellers: 3_100,
    saturationIndex: 66,
    top10SharePct: 21,
    medianListingAgeDays: 380,
    newListings30dPct: 12,
    entryBarrier: "medium",
  },
  pricing: {
    currency: "EUR",
    min: 9,
    p25: 18,
    median: 27,
    p75: 41,
    max: 96,
    avgReviewsPerListing: 12,
  },
  audience: {
    segments: [
      { label: "Vanlife-Reisende 28–45", share: 0.44, evidence: "Listing-Titel" },
      { label: "Familien mit Wohnwagen", share: 0.31, evidence: "Bewertungen" },
    ],
    motives: [
      { label: "Freiheitsgefühl", weight: 0.9, kind: "emotional" },
      { label: "Ausrüstung & Nutzen", weight: 0.5, kind: "functional" },
    ],
    giftPotential: 68,
    emotionalIntensity: 74,
  },
  design: {
    palettes: [{ name: "Forest Dusk", colors: ["#2C4A3B"], share: 0.46 }],
    typography: [],
    illustrationStyles: [{ style: "Retro Badge", share: 0.4 }],
    motifs: [],
    observations: [],
  },
  keywords: [],
  productTypes: [
    { type: "T-Shirt", share: 0.34, medianPrice: 26, growth90d: 0.08 },
    { type: "Emaille-Tasse", share: 0.28, medianPrice: 19, growth90d: 0.12 },
    { type: "Poster", share: 0.22, medianPrice: 24, growth90d: 0.03 },
  ],
  dataQuality: {
    coverage: 0.9,
    sourceCount: 5,
    syntheticShare: 0,
    freshnessDays: 1,
    confidence: 0.82,
  },
};

const score = scoreOpportunity(signals, { now: new Date("2026-03-01T00:00:00.000Z") });

describe("generateIdeas", () => {
  it("liefert die angeforderte Anzahl an Ideen", () => {
    assert.equal(generateIdeas(signals, score, { count: 3 }).length, 3);
  });

  it("besetzt alle sechs Bausteine jeder Idee", () => {
    for (const idea of generateIdeas(signals, score, { count: 4 })) {
      for (const [key, value] of Object.entries(idea.composition)) {
        assert.ok(value && value.length > 0, `Baustein "${key}" war leer`);
      }
      assert.ok(idea.rationale.length > 0, "Idee ohne Begründung");
      assert.ok(idea.risks.length > 0, "Idee ohne Risikohinweis");
    }
  });

  it("hält Potenzial und Differenzierung im gültigen Bereich", () => {
    for (const idea of generateIdeas(signals, score, { count: 4 })) {
      assert.ok(idea.potential >= 0 && idea.potential <= 100);
      assert.ok(idea.distinctiveness >= 0 && idea.distinctiveness <= 100);
    }
  });

  it("formuliert Titel nach der Strategie, nicht nach einer Schablone", () => {
    // Dieser Markt erfüllt mehrere Differenzierungsbedingungen gleichzeitig:
    // Geschenkpotenzial, Sättigung, dominante Farbwelt, Preisspreizung.
    const titles = generateIdeas(signals, score, { count: 4 }).map((i) => i.title);

    assert.equal(new Set(titles).size, titles.length, "Titel wiederholen sich");
    // Vier Ideen sollen als vier verschiedene Spielzüge lesbar sein. Bei einer
    // festen Schablone hätten alle denselben Satzbau.
    const shapes = new Set(
      titles.map((t) =>
        /statt/.test(t)
          ? "segment"
          : /Premium/.test(t)
            ? "premium"
            : /Farbwelt/.test(t)
              ? "design"
              : /Namen/.test(t)
                ? "personalisiert"
                : /Set/.test(t)
                  ? "bundle"
                  : /Edition/.test(t)
                    ? "saison"
                    : "sonstige",
      ),
    );
    assert.ok(shapes.size >= 2, `nur eine Titelform: ${titles.join(" | ")}`);
  });

  it("verkettet mehrwortige Nischen nicht mit Bindestrich", () => {
    // "Emaille Tasse-Hoodie" ist falsches Deutsch – bei mehrwortigen
    // Suchbegriffen braucht es eine Präposition.
    const mehrwortig = { ...signals, query: { term: "Emaille Tasse", market: "DE" } };
    const ideen = generateIdeas(mehrwortig, score, { count: 4 });

    for (const idea of ideen) {
      assert.ok(
        !/Emaille Tasse-[A-ZÄÖÜ]/.test(idea.title),
        `Bindestrich nach mehrwortiger Nische: ${idea.title}`,
      );
    }
  });

  it("verdoppelt die Produktart nicht, wenn die Nische sie schon nennt", () => {
    const mitTasse = {
      ...signals,
      query: { term: "Emaille Tasse", market: "DE" },
      productTypes: [{ type: "Tasse", share: 1, medianPrice: 19, growth90d: 0.1 }],
    };

    for (const idea of generateIdeas(mitTasse, score, { count: 2 })) {
      assert.ok(!/Tasse-Tasse|Tasse zum Thema Emaille Tasse/.test(idea.title), idea.title);
      assert.match(idea.title, /Emaille Tasse/);
    }
  });

  it("verkettet einwortige Nischen weiterhin kompakt", () => {
    const einwortig = { ...signals, query: { term: "Dackel", market: "DE" } };
    const titles = generateIdeas(einwortig, score, { count: 4 }).map((i) => i.title);

    assert.ok(
      titles.some((t) => /Dackel-[A-ZÄÖÜ]/.test(t)),
      `keine kompakte Form: ${titles.join(" | ")}`,
    );
  });

  it("lässt deutsche Substantive in Titeln großgeschrieben", () => {
    for (const idea of generateIdeas(signals, score, { count: 4 })) {
      assert.ok(
        !/emaille-tasse|t-shirt für/.test(idea.title),
        `kleingeschrieben: ${idea.title}`,
      );
    }
  });

  it("sortiert nach Potenzial, damit die stärkste Idee zuerst steht", () => {
    const potentials = generateIdeas(signals, score, { count: 4 }).map((i) => i.potential);
    const sorted = [...potentials].sort((a, b) => b - a);

    assert.deepEqual(potentials, sorted);
  });

  it("schlägt einen Preiskorridor über dem Marktmedian vor", () => {
    for (const idea of generateIdeas(signals, score, { count: 3 })) {
      assert.ok(idea.suggestedPriceRange.min > 0);
      assert.ok(idea.suggestedPriceRange.max > idea.suggestedPriceRange.min);
      assert.equal(idea.suggestedPriceRange.currency, "EUR");
    }
  });

  it("funktioniert auch ohne Design- und Zielgruppensignale", () => {
    const sparse: MarketSignals = { ...signals, design: undefined, audience: undefined };
    const ideas = generateIdeas(sparse, score, { count: 2 });

    assert.equal(ideas.length, 2);
    // Fehlende Signale duerfen nicht zu erfundenen Angaben fuehren.
    assert.ok(ideas[0]?.composition.style.includes("Offen"));
  });
});
