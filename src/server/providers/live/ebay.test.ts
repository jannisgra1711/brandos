import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import type { MarketQuery } from "@/domain/types";
import { resetConfig } from "@/server/config/env";
import type { Logger } from "@/server/logging/logger";
import type { ProviderContext } from "../types";
import { ebayProvider, resetEbayInfrastructure } from "./ebay";

/**
 * eBay ist die erste echte Quelle der Angebotsseite. Abgesichert wird, was
 * sie dem Rest des Systems zusagt:
 *
 *   1. Preise entstehen aus echten Listings – inklusive Spannen und
 *      unbrauchbarer Einträge.
 *   2. Was eine Ergebnisliste nicht weiß, bleibt leer: Listing-Alter,
 *      Neuzugänge, Anbieterzahl, Sättigung.
 *   3. Bezahlte Platzierungen zählen nicht zur Marktstichprobe.
 *   4. Fehlerfälle nennen den Grund im Klartext.
 */

const QUERY: MarketQuery = { term: "Emaille Tasse", market: "DE" };

const SILENT: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => SILENT,
  time: async (_label, fn) => fn(),
};

function context(): ProviderContext {
  return {
    now: new Date("2026-07-25T00:00:00.000Z"),
    logger: SILENT,
    signal: AbortSignal.timeout(5_000),
  };
}

function listing(price: number, seller: string, extras: Record<string, unknown> = {}) {
  return {
    price: { raw: `EUR ${price.toFixed(2)}`, extracted: price },
    seller: { username: seller, reviews: 120 },
    ...extras,
  };
}

/** Erzeugt `count` Listings mit gleichmäßig steigenden Preisen. */
function sample(count: number, from = 10, step = 1) {
  return Array.from({ length: count }, (_, i) =>
    listing(from + i * step, `verkaeufer-${i % 20}`),
  );
}

function stubFetch(handler: (url: string) => { status?: number; body: unknown }) {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const { status = 200, body } = handler(String(input));
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof globalThis.fetch;
  return () => {
    globalThis.fetch = original;
  };
}

function withKey(key = "test-key"): void {
  process.env.SERPAPI_KEY = key;
  process.env.BRANDOS_PROVIDER_CACHE_TTL_MS = "0";
  resetConfig();
  resetEbayInfrastructure();
}

afterEach(() => {
  delete process.env.SERPAPI_KEY;
  delete process.env.BRANDOS_PROVIDER_CACHE_TTL_MS;
  resetConfig();
  resetEbayInfrastructure();
});

describe("ebayProvider – Deklaration", () => {
  it("ist eine Live-Quelle für Wettbewerb und Preise", () => {
    assert.equal(ebayProvider.kind, "live");
    assert.deepEqual([...ebayProvider.capabilities], ["competition", "pricing"]);
  });

  it("steht über den Marktplatz-Mocks", () => {
    // Etsy-Mock liegt bei 10, Amazon bei 8 – echte Messungen sollen führen.
    assert.ok(ebayProvider.priority > 10, `Priorität ist ${ebayProvider.priority}`);
  });

  it("meldet sich nur mit gesetztem Key als verfügbar", () => {
    delete process.env.SERPAPI_KEY;
    resetConfig();
    assert.equal(ebayProvider.isAvailable(), false);

    withKey();
    assert.equal(ebayProvider.isAvailable(), true);
  });
});

describe("ebayProvider – Preise", () => {
  it("bildet die Verteilung aus echten Listings", async () => {
    withKey();
    // Preise 10 bis 109, gleichverteilt.
    const restore = stubFetch(() => ({
      body: { search_information: { total_results: 4200 }, organic_results: sample(100) },
    }));

    try {
      const result = await ebayProvider.fetch(QUERY, context());
      const pricing = result.payload.pricing;

      assert.equal(pricing?.currency, "EUR");
      assert.equal(pricing?.min, 10);
      assert.equal(pricing?.max, 109);
      assert.equal(pricing?.median, 59.5);
      assert.equal(pricing?.p25, 34.75);
      assert.equal(pricing?.p75, 84.25);
    } finally {
      restore();
    }
  });

  it("nimmt bei Preisspannen die Mitte", async () => {
    withKey();
    const ranged = Array.from({ length: 20 }, (_, i) => ({
      price: {
        from: { raw: "EUR 10,00", extracted: 10 },
        to: { raw: "EUR 30,00", extracted: 30 },
      },
      seller: { username: `v-${i}`, reviews: 10 },
    }));
    const restore = stubFetch(() => ({
      body: { search_information: { total_results: 99 }, organic_results: ranged },
    }));

    try {
      const result = await ebayProvider.fetch(QUERY, context());
      assert.equal(result.payload.pricing?.median, 20);
    } finally {
      restore();
    }
  });

  it("überspringt Listings ohne verwertbaren Preis", async () => {
    withKey();
    const mixed = [
      ...sample(20, 100, 0), // 20 Listings zu je 100
      { seller: { username: "ohne-preis" } },
      { price: { raw: "Preis auf Anfrage" }, seller: { username: "leer" } },
    ];
    const restore = stubFetch(() => ({
      body: { search_information: { total_results: 50 }, organic_results: mixed },
    }));

    try {
      const result = await ebayProvider.fetch(QUERY, context());
      assert.equal(result.payload.pricing?.median, 100);
      assert.equal(result.payload.pricing?.min, 100);
    } finally {
      restore();
    }
  });

  it("gibt keine Bewertungszahl aus, weil eBay nur Verkäuferwerte kennt", async () => {
    withKey();
    // `seller.reviews` ist die Lebenszeit-Bewertungszahl des Verkäufers über
    // alle Angebote – fünfstellig, wo einstellige Werte erwartet werden.
    const results = sample(10).map((l, i) => ({
      ...l,
      seller: { username: `v-${i}`, reviews: 45_000 + i },
    }));
    const restore = stubFetch(() => ({
      body: { search_information: { total_results: 10 }, organic_results: results },
    }));

    try {
      const result = await ebayProvider.fetch(QUERY, context());
      assert.equal(result.payload.pricing?.avgReviewsPerListing, undefined);
    } finally {
      restore();
    }
  });
});

describe("ebayProvider – Wettbewerb", () => {
  it("übernimmt die Gesamttrefferzahl, nicht die Stichprobengröße", async () => {
    withKey();
    const restore = stubFetch(() => ({
      body: { search_information: { total_results: 18_400 }, organic_results: sample(50) },
    }));

    try {
      const result = await ebayProvider.fetch(QUERY, context());
      assert.equal(result.payload.competition?.listingCount, 18_400);
    } finally {
      restore();
    }
  });

  it("lässt leer, was eine Ergebnisliste nicht weiß", async () => {
    withKey();
    const restore = stubFetch(() => ({
      body: { search_information: { total_results: 500 }, organic_results: sample(40) },
    }));

    try {
      const competition = (await ebayProvider.fetch(QUERY, context())).payload.competition;

      assert.equal(competition?.activeSellers, undefined, "Anbieterzahl ist nicht messbar");
      assert.equal(competition?.saturationIndex, undefined, "Sättigung ist keine Messung");
      assert.equal(competition?.medianListingAgeDays, undefined, "Listing-Alter fehlt in der Antwort");
      assert.equal(competition?.newListings30dPct, undefined, "Neuzugänge fehlen in der Antwort");
    } finally {
      restore();
    }
  });

  it("misst die Konzentration der häufigsten Anbieter", async () => {
    withKey();
    // 30 Listings: ein Anbieter hält 20, zehn weitere je eins.
    const concentrated = [
      ...Array.from({ length: 20 }, () => listing(25, "grossanbieter")),
      ...Array.from({ length: 10 }, (_, i) => listing(25, `klein-${i}`)),
    ];
    const restore = stubFetch(() => ({
      body: { search_information: { total_results: 900 }, organic_results: concentrated },
    }));

    try {
      const result = await ebayProvider.fetch(QUERY, context());
      // Top 10 = der Grossanbieter (20) plus neun Kleine = 29 von 30.
      assert.ok(
        (result.payload.competition?.top10SharePct ?? 0) > 90,
        `Top-10-Anteil: ${result.payload.competition?.top10SharePct}`,
      );
    } finally {
      restore();
    }
  });

  it("stuft die Einstiegshürde nach dem Preisniveau", async () => {
    withKey();
    const cases: [number, string][] = [
      [15, "low"],
      [60, "medium"],
      [200, "high"],
    ];

    for (const [price, expected] of cases) {
      resetEbayInfrastructure();
      const restore = stubFetch(() => ({
        body: {
          search_information: { total_results: 100 },
          organic_results: sample(20, price, 0),
        },
      }));
      try {
        const result = await ebayProvider.fetch(QUERY, context());
        assert.equal(result.payload.competition?.entryBarrier, expected, `bei Median ${price}`);
      } finally {
        restore();
      }
    }
  });
});

describe("ebayProvider – Stichprobe", () => {
  it("zählt bezahlte Platzierungen nicht zur Marktstichprobe", async () => {
    withKey();
    const mixed = [
      ...Array.from({ length: 20 }, () => listing(10, "organisch")),
      // Gesponserte Listings zu einem völlig anderen Preis.
      ...Array.from({ length: 20 }, () => listing(500, "bezahlt", { sponsored: true })),
    ];
    const restore = stubFetch(() => ({
      body: { search_information: { total_results: 300 }, organic_results: mixed },
    }));

    try {
      const result = await ebayProvider.fetch(QUERY, context());
      // Ohne Filter läge der Median bei 255.
      assert.equal(result.payload.pricing?.median, 10);
      assert.equal(result.payload.pricing?.max, 10);
    } finally {
      restore();
    }
  });

  it("senkt die Konfidenz bei kleiner Stichprobe", async () => {
    withKey();
    const restore = stubFetch(() => ({
      body: { search_information: { total_results: 12 }, organic_results: sample(10) },
    }));

    try {
      const small = await ebayProvider.fetch(QUERY, context());
      restore();

      resetEbayInfrastructure();
      const restoreBig = stubFetch(() => ({
        body: { search_information: { total_results: 9000 }, organic_results: sample(160) },
      }));
      try {
        const large = await ebayProvider.fetch(QUERY, context());
        assert.ok(
          large.confidence > small.confidence,
          `${large.confidence} sollte über ${small.confidence} liegen`,
        );
      } finally {
        restoreBig();
      }
    } finally {
      restore();
    }
  });

  it("wählt die Länderdomäne nach dem Markt", async () => {
    withKey();
    let requested = "";
    const restore = stubFetch((url) => {
      requested = url;
      return {
        body: { search_information: { total_results: 100 }, organic_results: sample(20) },
      };
    });

    try {
      await ebayProvider.fetch({ term: "mug", market: "US" }, context());
      assert.match(requested, /ebay_domain=ebay\.com/);
    } finally {
      restore();
    }
  });
});

describe("ebayProvider – Fehlerfälle", () => {
  it("nennt einen ungültigen Key im Klartext", async () => {
    withKey("falsch");
    const restore = stubFetch(() => ({ status: 401, body: {} }));
    try {
      await assert.rejects(() => ebayProvider.fetch(QUERY, context()), /SERPAPI_KEY ungültig/);
    } finally {
      restore();
    }
  });

  it("nennt ein erschöpftes Kontingent im Klartext", async () => {
    withKey();
    const restore = stubFetch(() => ({ status: 429, body: {} }));
    try {
      await assert.rejects(() => ebayProvider.fetch(QUERY, context()), /Kontingent erschöpft/);
    } finally {
      restore();
    }
  });

  it("meldet eine leere Trefferliste als solche", async () => {
    withKey();
    const restore = stubFetch(() => ({
      body: { search_information: { total_results: 0 }, organic_results: [] },
    }));
    try {
      await assert.rejects(() => ebayProvider.fetch(QUERY, context()), /keine Treffer/);
    } finally {
      restore();
    }
  });

  it("verweigert eine Verteilung aus zu wenigen Preisen", async () => {
    withKey();
    const restore = stubFetch(() => ({
      body: { search_information: { total_results: 40 }, organic_results: sample(3) },
    }));
    try {
      await assert.rejects(
        () => ebayProvider.fetch(QUERY, context()),
        /keine verwertbaren Preise/,
      );
    } finally {
      restore();
    }
  });
});
