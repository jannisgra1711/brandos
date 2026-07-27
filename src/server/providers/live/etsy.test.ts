import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import type { MarketQuery } from "@/domain/types";
import { resetConfig } from "@/server/config/env";
import type { Logger } from "@/server/logging/logger";
import { ProviderError, type ProviderContext } from "../types";
import { etsyProvider, resetEtsyInfrastructure } from "./etsy";

/**
 * Etsy ist die einzige angebundene Quelle, die ihre Listings datiert – und
 * damit die einzige, die `marketAge` aus einer Messung statt aus einer
 * Schätzung speisen kann. Abgesichert wird:
 *
 *   1. Preise entstehen aus `amount`/`divisor`, nicht aus einem Rohtext.
 *   2. Gemischte Währungen ergeben keine gemeinsame Verteilung.
 *   3. Das Listing-Alter kommt aus `original_creation_timestamp`.
 *   4. Was Etsy nicht weiß, bleibt leer – auch wenn der Mock es lieferte.
 *   5. Die Anfrage sortiert nach Relevanz, nicht nach Erstellungsdatum.
 */

const QUERY: MarketQuery = { term: "Emaille Tasse", market: "DE" };
const NOW = new Date("2026-07-25T00:00:00.000Z");

const SILENT: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => SILENT,
  time: async (_label, fn) => fn(),
};

function context(): ProviderContext {
  return { now: NOW, logger: SILENT, signal: AbortSignal.timeout(5_000) };
}

/** Sekunden seit Epoch für ein Listing, das vor `days` Tagen erschien. */
function createdDaysAgo(days: number): number {
  return Math.round((NOW.getTime() - days * 24 * 60 * 60 * 1000) / 1000);
}

function listing(
  price: number,
  shopId: number,
  extras: { ageDays?: number; currency?: string } = {},
) {
  return {
    listing_id: Math.round(price * 1000 + shopId),
    shop_id: shopId,
    price: {
      amount: Math.round(price * 100),
      divisor: 100,
      currency_code: extras.currency ?? "EUR",
    },
    original_creation_timestamp: createdDaysAgo(extras.ageDays ?? 400),
    taxonomy_id: 1234,
  };
}

/** `count` Listings mit gleichmäßig steigenden Preisen. */
function sample(count: number, from = 10, step = 1) {
  return Array.from({ length: count }, (_, i) => listing(from + i * step, i % 20));
}

function stubFetch(handler: (url: string, init?: RequestInit) => { status?: number; body: unknown }) {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const { status = 200, body } = handler(String(input), init);
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof globalThis.fetch;
  return () => {
    globalThis.fetch = original;
  };
}

function withKey(keystring = "test-keystring", secret = "test-secret"): void {
  process.env.ETSY_API_KEY = keystring;
  process.env.ETSY_API_SECRET = secret;
  process.env.BRANDOS_PROVIDER_CACHE_TTL_MS = "0";
  resetConfig();
  resetEtsyInfrastructure();
}

afterEach(() => {
  delete process.env.ETSY_API_KEY;
  delete process.env.ETSY_API_SECRET;
  delete process.env.BRANDOS_PROVIDER_CACHE_TTL_MS;
  resetConfig();
  resetEtsyInfrastructure();
});

describe("etsyProvider – Deklaration", () => {
  it("ist eine Live-Quelle für Wettbewerb und Preise", () => {
    assert.equal(etsyProvider.kind, "live");
    assert.deepEqual([...etsyProvider.capabilities], ["competition", "pricing"]);
  });

  it("beansprucht weder Zielgruppe noch Design", () => {
    // Der gleichnamige Mock liefert beides. Die echte API kennt nur Angebote,
    // keine Käufer – der Provider darf das nicht behaupten.
    assert.ok(!etsyProvider.capabilities.includes("audience"));
    assert.ok(!etsyProvider.capabilities.includes("design"));
    assert.ok(!etsyProvider.capabilities.includes("keywords"));
  });

  it("steht über eBay", () => {
    // Für handgemachte Nischen ist Etsy der Leitmarkt.
    assert.ok(etsyProvider.priority > 12, `Priorität ist ${etsyProvider.priority}`);
  });

  it("verlangt beide Zugangsdaten, nicht eines von beiden", () => {
    delete process.env.ETSY_API_KEY;
    delete process.env.ETSY_API_SECRET;
    resetConfig();
    assert.equal(etsyProvider.isAvailable(), false);

    // Eine halbe Angabe ergibt keinen gültigen Header – Etsy lehnt sie mit
    // "Shared secret is required" bzw. "API key not found" ab. Als verfügbar
    // zu gelten hiesse, bei jeder Analyse sicher zu scheitern.
    process.env.ETSY_API_KEY = "nur-keystring";
    resetConfig();
    assert.equal(etsyProvider.isAvailable(), false);

    delete process.env.ETSY_API_KEY;
    process.env.ETSY_API_SECRET = "nur-secret";
    resetConfig();
    assert.equal(etsyProvider.isAvailable(), false);

    withKey();
    assert.equal(etsyProvider.isAvailable(), true);
  });
});

describe("etsyProvider – Einordnung", () => {
  const TAXONOMY = {
    results: [
      {
        id: 1,
        name: "Home & Living",
        full_path_taxonomy_ids: [1],
        children: [{ id: 2, name: "Mugs", full_path_taxonomy_ids: [1, 2], children: [] }],
      },
    ],
  };

  it("ordnet die Treffer in die Taxonomie des Marktplatzes ein", async () => {
    withKey();
    const restore = stubFetch((url) =>
      url.includes("seller-taxonomy")
        ? { body: TAXONOMY }
        : { body: { count: 900, results: sample(100).map((l) => ({ ...l, taxonomy_id: 2 })) } },
    );

    try {
      const result = await etsyProvider.fetch(QUERY, context());
      const category = result.payload.category;

      assert.equal(category?.marketplace, "etsy");
      assert.equal(category?.categories[0]?.name, "Mugs");
      assert.equal(category?.categories[0]?.share, 1);
      assert.deepEqual(category?.categories[0]?.path, ["Home & Living", "Mugs"]);
    } finally {
      restore();
    }
  });

  it("liefert weiterhin Wettbewerb und Preise, wenn die Taxonomie ausfällt", async () => {
    // Die Einordnung ist eine Beigabe. Eine gelungene Messung wegen einer
    // Zusatzinformation wegzuwerfen wäre der teuerste mögliche Fehlschlag –
    // die Trefferliste ist zu diesem Zeitpunkt längst bezahlt.
    withKey();
    const restore = stubFetch((url) =>
      url.includes("seller-taxonomy")
        ? { status: 503, body: { error: "Taxonomie gerade nicht verfügbar" } }
        : { body: { count: 900, results: sample(100).map((l) => ({ ...l, taxonomy_id: 2 })) } },
    );

    try {
      const result = await etsyProvider.fetch(QUERY, context());

      assert.equal(result.payload.category, undefined);
      assert.ok(result.payload.competition, "Wettbewerb fehlt");
      assert.ok(result.payload.pricing, "Preise fehlen");
      assert.equal(result.synthetic, false);
    } finally {
      restore();
    }
  });

  it("ordnet nichts ein, wenn kein Listing eine bekannte Kategorie nennt", async () => {
    withKey();
    const restore = stubFetch((url) =>
      url.includes("seller-taxonomy")
        ? { body: TAXONOMY }
        : { body: { count: 900, results: sample(100) } },
    );

    try {
      const result = await etsyProvider.fetch(QUERY, context());
      // Lieber keine Einordnung als eine erfundene.
      assert.equal(result.payload.category, undefined);
      assert.ok(result.payload.competition);
    } finally {
      restore();
    }
  });
});

describe("etsyProvider – Anfrage", () => {
  it("sortiert nach Relevanz und schöpft das Limit aus", async () => {
    withKey();
    let requested = "";
    const restore = stubFetch((url) => {
      // Die Quelle ruft zwei Endpunkte: die Trefferliste und – für die
      // Einordnung – die Taxonomie. Geprüft wird hier die Trefferliste.
      if (url.includes("/listings/active")) requested = url;
      return { body: { count: 900, results: sample(100) } };
    });

    try {
      await etsyProvider.fetch(QUERY, context());
    } finally {
      restore();
    }

    const params = new URL(requested).searchParams;
    // Etsys Voreinstellung wäre `created` – die lieferte die jüngsten
    // Listings und damit ein Medianalter von Tagen.
    assert.equal(params.get("sort_on"), "score");
    assert.equal(params.get("limit"), "100");
    assert.equal(params.get("keywords"), "Emaille Tasse");
  });

  it("sendet Keystring und Secret zusammen im Header, nicht in der URL", async () => {
    withKey("mein-keystring", "mein-secret");
    let seenHeader: string | undefined;
    let seenUrl = "";
    const restore = stubFetch((url, init) => {
      seenUrl = url;
      seenHeader = (init?.headers as Record<string, string> | undefined)?.["x-api-key"];
      return { body: { count: 900, results: sample(100) } };
    });

    try {
      await etsyProvider.fetch(QUERY, context());
    } finally {
      restore();
    }

    // Etsy verlangt genau diese Form: "Invalid API key: should be in the
    // format 'keystring:shared_secret'." Einzeln gesendet lehnt die API ab.
    assert.equal(seenHeader, "mein-keystring:mein-secret");
    assert.ok(!seenUrl.includes("mein-secret"), "das Secret stand in der URL");
  });
});

describe("etsyProvider – Preise", () => {
  it("rechnet amount und divisor in einen Betrag um", async () => {
    withKey();
    const restore = stubFetch(() => ({
      body: {
        count: 50,
        // 1999/100 = 19,99
        results: Array.from({ length: 10 }, (_, i) => ({
          shop_id: i,
          price: { amount: 1999, divisor: 100, currency_code: "EUR" },
          original_creation_timestamp: createdDaysAgo(200),
        })),
      },
    }));

    try {
      const result = await etsyProvider.fetch(QUERY, context());
      assert.equal(result.payload.pricing?.median, 19.99);
      assert.equal(result.payload.pricing?.currency, "EUR");
    } finally {
      restore();
    }
  });

  it("mischt keine Währungen, sondern nimmt die häufigste", async () => {
    withKey();
    const restore = stubFetch(() => ({
      body: {
        count: 50,
        results: [
          ...Array.from({ length: 8 }, (_, i) => listing(20, i, { currency: "EUR" })),
          // Ohne Kurse wäre jede Zusammenführung erfunden.
          ...Array.from({ length: 3 }, (_, i) => listing(500, 90 + i, { currency: "USD" })),
        ],
      },
    }));

    try {
      const result = await etsyProvider.fetch(QUERY, context());
      assert.equal(result.payload.pricing?.currency, "EUR");
      assert.equal(result.payload.pricing?.max, 20, "ein Fremdwährungspreis kam durch");
    } finally {
      restore();
    }
  });

  it("überspringt Listings ohne verwertbaren Preis", async () => {
    withKey();
    const restore = stubFetch(() => ({
      body: {
        count: 50,
        results: [
          ...sample(8, 10, 0),
          { shop_id: 99, price: { amount: 0, divisor: 100, currency_code: "EUR" } },
          { shop_id: 98 },
          { shop_id: 97, price: { amount: 500, divisor: 0, currency_code: "EUR" } },
        ],
      },
    }));

    try {
      const result = await etsyProvider.fetch(QUERY, context());
      assert.equal(result.payload.pricing?.median, 10);
    } finally {
      restore();
    }
  });

  it("scheitert, wenn zu wenige Preise für eine Verteilung übrig bleiben", async () => {
    withKey();
    const restore = stubFetch(() => ({ body: { count: 4, results: sample(4) } }));

    try {
      await assert.rejects(
        () => etsyProvider.fetch(QUERY, context()),
        (error: unknown) =>
          error instanceof ProviderError && /keine verwertbaren Preise/.test(error.message),
      );
    } finally {
      restore();
    }
  });
});

describe("etsyProvider – Wettbewerb", () => {
  it("übernimmt die Gesamttrefferzahl, nicht die Stichprobengröße", async () => {
    withKey();
    const restore = stubFetch(() => ({ body: { count: 12_480, results: sample(100) } }));

    try {
      const result = await etsyProvider.fetch(QUERY, context());
      assert.equal(result.payload.competition?.listingCount, 12_480);
    } finally {
      restore();
    }
  });

  it("misst das Medianalter aus dem Veröffentlichungsdatum", async () => {
    withKey();
    const restore = stubFetch(() => ({
      body: {
        count: 50,
        results: [
          ...Array.from({ length: 5 }, (_, i) => listing(20, i, { ageDays: 100 })),
          ...Array.from({ length: 5 }, (_, i) => listing(20, 10 + i, { ageDays: 300 })),
        ],
      },
    }));

    try {
      const result = await etsyProvider.fetch(QUERY, context());
      // Der Grund, warum Etsy gebraucht wird: keine andere Quelle datiert.
      assert.equal(result.payload.competition?.medianListingAgeDays, 200);
    } finally {
      restore();
    }
  });

  it("weist den Anteil junger Listings aus", async () => {
    withKey();
    const restore = stubFetch(() => ({
      body: {
        count: 50,
        results: [
          ...Array.from({ length: 3 }, (_, i) => listing(20, i, { ageDays: 10 })),
          ...Array.from({ length: 7 }, (_, i) => listing(20, 10 + i, { ageDays: 500 })),
        ],
      },
    }));

    try {
      const result = await etsyProvider.fetch(QUERY, context());
      assert.equal(result.payload.competition?.newListings30dPct, 30);
    } finally {
      restore();
    }
  });

  it("lässt das Alter leer, wenn kein Listing datiert ist", async () => {
    withKey();
    const restore = stubFetch(() => ({
      body: {
        count: 50,
        results: Array.from({ length: 10 }, (_, i) => ({
          shop_id: i,
          price: { amount: 2000, divisor: 100, currency_code: "EUR" },
        })),
      },
    }));

    try {
      const result = await etsyProvider.fetch(QUERY, context());
      assert.equal(result.payload.competition?.medianListingAgeDays, undefined);
      assert.equal(result.payload.competition?.newListings30dPct, undefined);
    } finally {
      restore();
    }
  });

  it("ignoriert ein Veröffentlichungsdatum aus der Zukunft", async () => {
    withKey();
    const restore = stubFetch(() => ({
      body: {
        count: 50,
        results: [
          ...Array.from({ length: 9 }, (_, i) => listing(20, i, { ageDays: 100 })),
          listing(20, 50, { ageDays: -30 }),
        ],
      },
    }));

    try {
      const result = await etsyProvider.fetch(QUERY, context());
      // Ein Datenfehler darf den Markt nicht jünger aussehen lassen.
      assert.equal(result.payload.competition?.medianListingAgeDays, 100);
    } finally {
      restore();
    }
  });

  it("misst die Konzentration über die Shops der Stichprobe", async () => {
    withKey();
    const restore = stubFetch(() => ({
      body: {
        count: 200,
        results: [
          ...Array.from({ length: 10 }, () => listing(20, 1)),
          ...Array.from({ length: 10 }, (_, i) => listing(20, 100 + i)),
        ],
      },
    }));

    try {
      const result = await etsyProvider.fetch(QUERY, context());
      // Elf Shops, die zehn groessten halten 19 von 20 Listings.
      assert.equal(result.payload.competition?.top10SharePct, 95);
    } finally {
      restore();
    }
  });

  it("lässt leer, was eine Listing-Liste nicht hergibt", async () => {
    withKey();
    const restore = stubFetch(() => ({ body: { count: 900, results: sample(100) } }));

    try {
      const result = await etsyProvider.fetch(QUERY, context());
      const competition = result.payload.competition;

      assert.equal(competition?.activeSellers, undefined, "Anbieterzahl wurde erfunden");
      assert.equal(competition?.saturationIndex, undefined, "Sättigung wurde erfunden");
      assert.equal(
        result.payload.pricing?.avgReviewsPerListing,
        undefined,
        "Listing-Bewertungen wurden erfunden",
      );
    } finally {
      restore();
    }
  });

  it("meldet die Daten als nicht synthetisch", async () => {
    withKey();
    const restore = stubFetch(() => ({ body: { count: 900, results: sample(100) } }));

    try {
      const result = await etsyProvider.fetch(QUERY, context());
      assert.equal(result.synthetic, false);
      assert.equal(result.freshnessDays, 0);
    } finally {
      restore();
    }
  });
});

describe("etsyProvider – Fehlerfälle", () => {
  it("nennt einen fehlenden Schlüssel beim Namen", async () => {
    delete process.env.ETSY_API_SECRET;
    process.env.BRANDOS_PROVIDER_CACHE_TTL_MS = "0";
    resetConfig();
    resetEtsyInfrastructure();

    await assert.rejects(
      () => etsyProvider.fetch(QUERY, context()),
      (error: unknown) => error instanceof ProviderError && /ETSY_API_SECRET/.test(error.message),
    );
  });

  it("reicht Etsys Begründung für einen abgelehnten Schlüssel durch", async () => {
    withKey();
    // Der Header erwartet das Shared Secret, nicht den Keystring. Wer das
    // verwechselt, bekommt genau diese Meldung – und nur sie führt zur
    // Lösung. Eine eigene Formulierung an ihrer Stelle würde die Spur
    // verwischen, die im Quellenprotokoll landet.
    const restore = stubFetch(() => ({
      status: 403,
      body: { error: "Shared secret is required in x-api-key header." },
    }));

    try {
      await assert.rejects(
        () => etsyProvider.fetch(QUERY, context()),
        (error: unknown) => error instanceof ProviderError && /Shared secret is required/.test(error.message),
      );
    } finally {
      restore();
    }
  });

  it("bleibt aussagefähig, wenn Etsy keinen Grund nennt", async () => {
    withKey();
    // `undefined` erzeugt im Stub einen wirklich leeren Rumpf – genau das,
    // was Etsy bei einem abgelehnten Schlüssel zurückgibt.
    const restore = stubFetch(() => ({ status: 401, body: undefined }));

    try {
      await assert.rejects(
        () => etsyProvider.fetch(QUERY, context()),
        (error: unknown) => error instanceof ProviderError && /ETSY_API_SECRET abgelehnt/.test(error.message),
      );
    } finally {
      restore();
    }
  });

  it("erklärt ein erschöpftes Kontingent", async () => {
    withKey();
    const restore = stubFetch(() => ({ status: 429, body: {} }));

    try {
      await assert.rejects(
        () => etsyProvider.fetch(QUERY, context()),
        (error: unknown) => error instanceof ProviderError && /Kontingent/.test(error.message),
      );
    } finally {
      restore();
    }
  });

  it("reicht eine Fehlermeldung von Etsy durch", async () => {
    withKey();
    const restore = stubFetch(() => ({ body: { error: "Invalid taxonomy_id" } }));

    try {
      await assert.rejects(
        () => etsyProvider.fetch(QUERY, context()),
        (error: unknown) => error instanceof ProviderError && /Invalid taxonomy_id/.test(error.message),
      );
    } finally {
      restore();
    }
  });

  it("meldet einen leeren Treffersatz als Eigenschaft des Begriffs", async () => {
    withKey();
    const restore = stubFetch(() => ({ body: { count: 0, results: [] } }));

    try {
      await assert.rejects(
        () => etsyProvider.fetch(QUERY, context()),
        (error: unknown) => error instanceof ProviderError && /keine Treffer/.test(error.message),
      );
    } finally {
      restore();
    }
  });
});
