import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import type { MarketQuery } from "@/domain/types";
import { resetConfig } from "@/server/config/env";
import type { Logger } from "@/server/logging/logger";
import type { ProviderContext } from "../types";
import { googleTrendsProvider } from "./google-trends";

/**
 * Der erste Live-Provider. Was hier abgesichert wird, ist nicht die
 * Rechenlogik allein, sondern die Zusage an den Rest des Systems:
 *
 *   1. Wochenwerte werden zu Monaten verdichtet – ohne die Zeitreihe zu
 *      verfälschen.
 *   2. `estimatedMonthlySearches` bleibt leer. Trends kennt kein absolutes
 *      Volumen; eine Hochrechnung wäre eine erfundene Zahl.
 *   3. Saisonalität entsteht aus dem Mehrjahresmittel, nicht aus einem Jahr.
 *   4. Fehlerfälle nennen den Grund im Klartext – der Nutzer sieht ihn im
 *      Quellenprotokoll.
 *
 * Die Antworten sind nachgebaute SerpAPI-Nutzlasten. Sie prüfen den Umgang
 * mit der dokumentierten Form, nicht die Erreichbarkeit des Dienstes.
 */

const QUERY: MarketQuery = { term: "Camping", market: "DE" };

const SILENT: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => SILENT,
  time: async (_label, fn) => fn(),
};

function context(): ProviderContext {
  return { now: new Date("2026-07-01T00:00:00.000Z"), logger: SILENT, signal: AbortSignal.timeout(5_000) };
}

/** Unix-Sekunden für den ersten Tag eines Monats. */
function stamp(year: number, month: number, day = 1): string {
  return String(Math.floor(Date.UTC(year, month - 1, day) / 1000));
}

function entry(year: number, month: number, day: number, value: number) {
  return { timestamp: stamp(year, month, day), values: [{ extracted_value: value }] };
}

/**
 * Baut eine Zeitreihe über `years` Jahre mit einem festen Monatsprofil.
 * Zwei Wochenpunkte je Monat, damit die Verdichtung tatsächlich mittelt.
 */
function timeline(years: number[], profile: number[], scale = 1) {
  const data: ReturnType<typeof entry>[] = [];
  for (const year of years) {
    for (let month = 1; month <= 12; month += 1) {
      const base = (profile[month - 1] ?? 50) * scale;
      data.push(entry(year, month, 1, base - 2));
      data.push(entry(year, month, 15, base + 2));
    }
  }
  return data;
}

/** Ersetzt globalThis.fetch für die Dauer eines Tests. */
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
  resetConfig();
}

afterEach(() => {
  delete process.env.SERPAPI_KEY;
  resetConfig();
});

describe("googleTrendsProvider – Verfügbarkeit", () => {
  it("meldet sich nur mit gesetztem Key als verfügbar", () => {
    delete process.env.SERPAPI_KEY;
    resetConfig();
    assert.equal(googleTrendsProvider.isAvailable(), false);

    withKey();
    assert.equal(googleTrendsProvider.isAvailable(), true);
  });

  it("ist als Live-Quelle mit Leitpriorität deklariert", () => {
    assert.equal(googleTrendsProvider.kind, "live");
    assert.equal(googleTrendsProvider.priority, 20);
    assert.deepEqual([...googleTrendsProvider.capabilities], ["demand"]);
  });
});

describe("googleTrendsProvider – Aufbereitung", () => {
  it("verdichtet Wochenwerte zu Monatsmitteln", async () => {
    withKey();
    const flat = new Array(12).fill(50);
    const restore = stubFetch(() => ({
      body: { interest_over_time: { timeline_data: timeline([2024, 2025, 2026], flat) } },
    }));

    try {
      const result = await googleTrendsProvider.fetch(QUERY, context());
      const series = result.payload.demand?.series ?? [];

      // 36 Monate, auf das Standardfenster von 24 beschnitten.
      assert.equal(series.length, 24);
      assert.equal(series[0]?.period.length, 7);
      // Zwei Wochenpunkte (48 und 52) ergeben den Monatswert 50.
      assert.equal(series[0]?.value, 50);
      assert.equal(result.synthetic, false);
    } finally {
      restore();
    }
  });

  it("lässt estimatedMonthlySearches leer", async () => {
    withKey();
    const restore = stubFetch(() => ({
      body: {
        interest_over_time: { timeline_data: timeline([2024, 2025, 2026], new Array(12).fill(60)) },
      },
    }));

    try {
      const result = await googleTrendsProvider.fetch(QUERY, context());
      assert.equal(result.payload.demand?.estimatedMonthlySearches, undefined);
      // Der relative Index wird dagegen sehr wohl geliefert.
      assert.equal(result.payload.demand?.volumeIndex, 60);
    } finally {
      restore();
    }
  });

  it("erkennt einen steigenden Markt an beiden Zeiträumen", async () => {
    withKey();
    // Gleichmäßiger Anstieg über drei Jahre, ohne Saisonmuster.
    const data: ReturnType<typeof entry>[] = [];
    let value = 20;
    for (const year of [2024, 2025, 2026]) {
      for (let month = 1; month <= 12; month += 1) {
        data.push(entry(year, month, 1, value));
        data.push(entry(year, month, 15, value));
        value += 2;
      }
    }
    const restore = stubFetch(() => ({ body: { interest_over_time: { timeline_data: data } } }));

    try {
      const result = await googleTrendsProvider.fetch(QUERY, context());
      const demand = result.payload.demand;
      assert.equal(demand?.direction, "rising");
      assert.ok((demand?.growth90d ?? 0) > 0, "90-Tage-Wachstum muss positiv sein");
      assert.ok((demand?.growth12m ?? 0) > 0, "Jahreswachstum muss positiv sein");
    } finally {
      restore();
    }
  });

  it("meldet einen stark schwankenden Markt als volatil, nicht als steigend", async () => {
    withKey();
    const data: ReturnType<typeof entry>[] = [];
    for (const year of [2024, 2025, 2026]) {
      for (let month = 1; month <= 12; month += 1) {
        // Wechsel zwischen 10 und 90 – hohe Streuung ohne echte Richtung.
        const value = month % 2 === 0 ? 90 : 10;
        data.push(entry(year, month, 1, value));
        data.push(entry(year, month, 15, value));
      }
    }
    const restore = stubFetch(() => ({ body: { interest_over_time: { timeline_data: data } } }));

    try {
      const result = await googleTrendsProvider.fetch(QUERY, context());
      assert.equal(result.payload.demand?.direction, "volatile");
    } finally {
      restore();
    }
  });
});

describe("googleTrendsProvider – Saisonalität", () => {
  const WINTER = [30, 28, 35, 45, 60, 80, 95, 90, 65, 45, 35, 30];

  it("findet wiederkehrende Peaks über mehrere Jahre", async () => {
    withKey();
    const restore = stubFetch(() => ({
      body: { interest_over_time: { timeline_data: timeline([2023, 2024, 2025, 2026], WINTER) } },
    }));

    try {
      const result = await googleTrendsProvider.fetch(QUERY, context());
      const season = result.payload.seasonality;

      assert.ok(season, "Saisonalität muss geliefert werden");
      assert.equal(season.monthlyIndex.length, 12);
      // Juli ist der stärkste Monat, Februar der schwächste.
      assert.ok(season.peakMonths.includes(7), `Peak-Monate: ${season.peakMonths.join(", ")}`);
      assert.ok(season.lowMonths.includes(2), `Schwache Monate: ${season.lowMonths.join(", ")}`);
      assert.ok(season.amplitude > 0.15, `Amplitude zu niedrig: ${season.amplitude}`);
    } finally {
      restore();
    }
  });

  it("weist einen ganzjährigen Markt mit niedriger Amplitude aus", async () => {
    withKey();
    const restore = stubFetch(() => ({
      body: {
        interest_over_time: { timeline_data: timeline([2024, 2025, 2026], new Array(12).fill(50)) },
      },
    }));

    try {
      const result = await googleTrendsProvider.fetch(QUERY, context());
      assert.ok(
        (result.payload.seasonality?.amplitude ?? 1) < 0.15,
        "Ein flacher Verlauf darf keine Saison behaupten",
      );
    } finally {
      restore();
    }
  });

  it("behauptet keine Anlässe, die Trends nicht kennt", async () => {
    withKey();
    const restore = stubFetch(() => ({
      body: { interest_over_time: { timeline_data: timeline([2024, 2025, 2026], WINTER) } },
    }));

    try {
      const result = await googleTrendsProvider.fetch(QUERY, context());
      assert.deepEqual(result.payload.seasonality?.drivers, []);
    } finally {
      restore();
    }
  });
});

describe("googleTrendsProvider – Fehlerfälle", () => {
  it("nennt einen ungültigen Key im Klartext", async () => {
    withKey("falsch");
    const restore = stubFetch(() => ({ status: 401, body: {} }));

    try {
      await assert.rejects(
        () => googleTrendsProvider.fetch(QUERY, context()),
        /SERPAPI_KEY ungültig/,
      );
    } finally {
      restore();
    }
  });

  it("nennt ein erschöpftes Kontingent im Klartext", async () => {
    withKey();
    const restore = stubFetch(() => ({ status: 429, body: {} }));

    try {
      await assert.rejects(
        () => googleTrendsProvider.fetch(QUERY, context()),
        /Kontingent erschöpft/,
      );
    } finally {
      restore();
    }
  });

  it("reicht die Fehlermeldung von SerpAPI durch", async () => {
    withKey();
    const restore = stubFetch(() => ({
      body: { error: "Google Trends hasn't returned any results for this query." },
    }));

    try {
      await assert.rejects(
        () => googleTrendsProvider.fetch(QUERY, context()),
        /hasn't returned any results/,
      );
    } finally {
      restore();
    }
  });

  it("verweigert eine Trendaussage bei zu dünner Historie", async () => {
    withKey();
    const restore = stubFetch(() => ({
      body: {
        interest_over_time: {
          timeline_data: [entry(2026, 5, 1, 40), entry(2026, 6, 1, 45), entry(2026, 7, 1, 50)],
        },
      },
    }));

    try {
      await assert.rejects(
        () => googleTrendsProvider.fetch(QUERY, context()),
        /Zu wenige Datenpunkte/,
      );
    } finally {
      restore();
    }
  });

  it("überspringt unbrauchbare Einträge statt zu scheitern", async () => {
    withKey();
    const valid = timeline([2024, 2025, 2026], new Array(12).fill(55));
    const restore = stubFetch(() => ({
      body: {
        interest_over_time: {
          timeline_data: [
            { timestamp: undefined, values: [{ extracted_value: 999 }] },
            { timestamp: stamp(2025, 3), values: [] },
            ...valid,
          ],
        },
      },
    }));

    try {
      const result = await googleTrendsProvider.fetch(QUERY, context());
      assert.equal(result.payload.demand?.volumeIndex, 55);
    } finally {
      restore();
    }
  });
});
