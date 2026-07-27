import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ETSY_LIMITS } from "@/domain/types";
import type { MarketSignals, ProductProject } from "@/domain/types";
import { buildListingDraft, buildTags, buildTitle } from "./draft";

/**
 * Ein Listing geht nach draussen. Abgesichert wird deshalb schärfer als sonst:
 *
 *   1. Etsys Grenzen werden nie überschritten – auch nicht knapp.
 *   2. Was gemessen ist, weist sich als gemessen aus; der Rest nicht.
 *   3. Ohne Analyse entsteht trotzdem ein brauchbarer Entwurf.
 *   4. Die Beschreibung bleibt leer, statt regelbasiert erfunden zu werden.
 */

const NOW = new Date("2026-07-27T12:00:00.000Z");

function project(overrides: Partial<ProductProject> = {}): ProductProject {
  return {
    id: "vorhaben-1",
    analysisId: "analyse-1",
    term: "Emaille Tasse",
    market: "DE",
    title: "Emaille-Tasse mit Namen",
    status: "entwurf",
    composition: {
      niche: "Emaille Tasse",
      productType: "Tasse",
      audience: "Geschenkkäufer",
      emotion: "Verbundenheit",
      style: "Minimal Mono",
      differentiator: "Personalisierung",
    },
    suggestedPriceRange: { min: 17, max: 25, currency: "EUR" },
    origin: { ideaId: "idee-1", score: 47, grade: "C", potential: 60, distinctiveness: 55 },
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...overrides,
  };
}

function signals(overrides: Partial<MarketSignals> = {}): MarketSignals {
  return {
    query: { term: "Emaille Tasse", market: "DE" },
    collectedAt: NOW.toISOString(),
    sources: [],
    keywords: [],
    productTypes: [],
    pricing: {
      currency: "EUR",
      min: 6,
      p25: 13,
      median: 17.06,
      p75: 20,
      max: 60,
    },
    category: {
      marketplace: "etsy",
      categories: [
        {
          name: "Mugs",
          path: ["Home & Living", "Kitchen & Dining", "Drinkware", "Mugs"],
          share: 0.82,
          listings: 82,
        },
      ],
      distinctCategories: 8,
      sampleSize: 100,
    },
    provenance: {
      pricing: { sources: ["etsy", "ebay"], syntheticShare: 0 },
      category: { sources: ["etsy"], syntheticShare: 0 },
    },
    dataQuality: {
      coverage: 0.8,
      sourceCount: 3,
      syntheticShare: 0.5,
      confidence: 0.74,
      freshnessDays: 0,
    },
    ...overrides,
  };
}

describe("buildTitle", () => {
  it("stellt den Suchbegriff nach vorn", () => {
    assert.ok(buildTitle(project()).startsWith("Emaille Tasse"));
  });

  it("wiederholt die Produktart nicht, wenn sie schon im Begriff steht", () => {
    const title = buildTitle(project({ term: "Emaille Tasse", composition: { ...project().composition, productType: "Tasse" } }));
    assert.equal(title.match(/Tasse/g)?.length, 1, `doppelt in "${title}"`);
  });

  it("ergänzt die Produktart, wenn sie fehlt", () => {
    const title = buildTitle(
      project({ term: "Dackel", composition: { ...project().composition, productType: "Poster" } }),
    );
    assert.ok(title.includes("Dackel"));
    assert.ok(title.includes("Poster"));
  });

  it("hält Etsys 140 Zeichen ein und kürzt dabei von hinten", () => {
    const title = buildTitle(
      project({
        composition: {
          ...project().composition,
          differentiator: "A".repeat(90),
          audience: "B".repeat(90),
        },
      }),
    );

    assert.ok(title.length <= ETSY_LIMITS.titleMaxLength, `${title.length} Zeichen`);
    // Der Kern überlebt, das Beiwerk fällt.
    assert.ok(title.startsWith("Emaille Tasse"));
  });

  it("kürzt notfalls an einer Wortgrenze, nicht mitten im Wort", () => {
    const title = buildTitle(project({ term: "Wort ".repeat(40).trim() }));

    assert.ok(title.length <= ETSY_LIMITS.titleMaxLength);
    assert.ok(!title.endsWith("Wor"), `mitten im Wort geschnitten: "${title.slice(-20)}"`);
  });
});

describe("buildTags", () => {
  it("hält Zahl und Länge der Tags ein", () => {
    const tags = buildTags(project());

    assert.ok(tags.length <= ETSY_LIMITS.maxTags, `${tags.length} Tags`);
    for (const tag of tags) {
      assert.ok(tag.length <= ETSY_LIMITS.tagMaxLength, `"${tag}" hat ${tag.length} Zeichen`);
    }
  });

  it("verwirft zu lange Kandidaten, statt sie zu verstümmeln", () => {
    const tags = buildTags(
      project({
        composition: { ...project().composition, differentiator: "Ein viel zu langer Zusatz ohne Ende" },
      }),
    );

    assert.ok(!tags.some((t) => t.startsWith("Ein viel zu langer")));
    for (const tag of tags) {
      assert.ok(tag.length <= ETSY_LIMITS.tagMaxLength);
    }
  });

  it("zerlegt mehrwortige Bausteine nicht in Einzelwörter", () => {
    // Gegen die echte API gemessen entstanden so die Tags „oder" und „Daten".
    const tags = buildTags(
      project({
        term: "Padel",
        composition: {
          ...project().composition,
          differentiator: "Personalisierung mit Namen oder Daten",
        },
      }),
    );

    assert.ok(!tags.includes("oder"), `Bindewort als Tag: ${tags.join(", ")}`);
    assert.ok(!tags.includes("Daten"), `Bruchstück als Tag: ${tags.join(", ")}`);
  });

  it("zerlegt den Suchbegriff sehr wohl – den hat der Verkäufer gewählt", () => {
    const tags = buildTags(project({ term: "Emaille Tasse" }));

    assert.ok(tags.includes("Emaille"));
    assert.ok(tags.includes("Tasse"));
  });

  it("lässt Funktionswörter aus dem Suchbegriff heraus", () => {
    const tags = buildTags(project({ term: "Tasse für Camping" }));

    assert.ok(!tags.includes("für"), `Stoppwort als Tag: ${tags.join(", ")}`);
    assert.ok(tags.includes("Camping"));
  });

  it("nimmt keinen Tag doppelt, auch nicht in anderer Schreibweise", () => {
    const tags = buildTags(project());
    const lowered = tags.map((t) => t.toLowerCase());
    assert.equal(new Set(lowered).size, tags.length);
  });

  it("gibt die Originalschreibweise aus, nicht die Vergleichsform", () => {
    // Kein toLowerCase auf deutschem Text – der Vergleich darf, die Ausgabe nicht.
    assert.ok(buildTags(project()).includes("Emaille Tasse"));
  });
});

describe("buildListingDraft – Herkunft", () => {
  it("weist die Kategorie als gemessen aus", () => {
    const draft = buildListingDraft({ project: project(), signals: signals(), now: NOW });

    assert.equal(draft.category?.name, "Mugs");
    assert.deepEqual(draft.basis.category?.sources, ["etsy"]);
    assert.equal(draft.basis.category?.synthetic, false);
    assert.match(draft.basis.category?.rationale ?? "", /82 %/);
  });

  it("weist den Preis als gemessen aus und nennt das Preisband", () => {
    const draft = buildListingDraft({ project: project(), signals: signals(), now: NOW });

    assert.equal(draft.price?.value, 17.06);
    assert.equal(draft.price?.currency, "EUR");
    assert.deepEqual(draft.basis.price?.sources, ["etsy", "ebay"]);
    assert.match(draft.basis.price?.rationale ?? "", /13,00–20,00 EUR/);
  });

  it("nennt Titel und Tags als abgeleitet, nicht als gemessen", () => {
    const draft = buildListingDraft({ project: project(), signals: signals(), now: NOW });

    assert.deepEqual(draft.basis.title?.sources, []);
    assert.deepEqual(draft.basis.tags?.sources, []);
    // Der Grund gehört dazu: Es gibt keine gemessene Keyword-Quelle.
    assert.match(draft.basis.tags?.rationale ?? "", /Keyword-Quelle/);
  });

  it("warnt, wenn die gemessene Währung nicht zum Markt passt", () => {
    // Etsys Leitwährung ist die häufigste der Trefferliste, nicht die des
    // Marktes – bei "Padel" kam GBP für einen DE-Markt zurück.
    const draft = buildListingDraft({
      project: project(),
      signals: signals({ pricing: { currency: "GBP", min: 6, p25: 13, median: 22, p75: 30, max: 60 } }),
      now: NOW,
    });

    assert.match(draft.basis.price?.rationale ?? "", /Markt DE rechnet in EUR/);
    assert.match(draft.basis.price?.rationale ?? "", /GBP/);
  });

  it("schweigt zur Währung, wenn sie passt", () => {
    const draft = buildListingDraft({ project: project(), signals: signals(), now: NOW });
    assert.doesNotMatch(draft.basis.price?.rationale ?? "", /Achtung/);
  });
});

describe("buildListingDraft – ohne Analyse", () => {
  it("erzeugt trotzdem Titel und Tags", () => {
    const draft = buildListingDraft({ project: project(), now: NOW });

    assert.ok(draft.title.length > 0);
    assert.ok(draft.tags.length > 0);
  });

  it("lässt die Kategorie weg, statt eine zu erfinden", () => {
    const draft = buildListingDraft({ project: project(), now: NOW });

    assert.equal(draft.category, undefined);
    assert.equal(draft.basis.category, undefined);
  });

  it("fällt beim Preis auf den Korridor der Idee zurück und sagt es", () => {
    const draft = buildListingDraft({ project: project(), now: NOW });

    assert.equal(draft.price?.value, 21);
    assert.match(draft.basis.price?.rationale ?? "", /nicht mehr verfügbar/);
    assert.deepEqual(draft.basis.price?.sources, []);
  });
});

describe("buildListingDraft – Beschreibung", () => {
  it("bleibt leer, statt regelbasiert erfunden zu werden", () => {
    const draft = buildListingDraft({ project: project(), signals: signals(), now: NOW });

    assert.equal(draft.description, undefined);
    assert.equal(draft.basis.description, undefined);
  });
});
