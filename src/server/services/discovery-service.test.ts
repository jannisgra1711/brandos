import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import type { SourceId } from "@/domain/types";
import type {
  DataProvider,
  DiscoverySeed,
  ProviderPayload,
  ProviderResult,
} from "@/server/providers/types";
import { discoverOpportunities, resetDiscoveryCache, trendMovers } from "./discovery-service";

/**
 * Discovery ist der teuerste Pfad des Systems: Jeder Kandidat kostet einen
 * Provider-Abruf, und die Kandidatenliste kommt von den Providern selbst.
 * Abgesichert wird deshalb vor allem, was Geld und Vertrauen kostet:
 *
 *   1. Kandidaten werden zusammengeführt, nicht doppelt bewertet.
 *   2. Das Limit greift *vor* dem Scan, nicht danach.
 *   3. Ein Kandidat ohne Nachfragesignal wird verworfen statt geraten.
 *   4. Die erzeugten Sätze sind deutsch – Zahlen wie Formulierung.
 *   5. Der Cache verhindert, dass jeder Seitenaufruf erneut zahlt.
 */

const NOW = new Date("2026-03-15T12:00:00.000Z");

/** Aufzeichnung der Provider-Aufrufe – die Grundlage der Kostentests. */
interface Calls {
  discover: number;
  fetched: string[];
}

function series(values: number[]): { period: string; value: number }[] {
  return values.map((value, i) => ({ period: `2026-${String(i + 1).padStart(2, "0")}`, value }));
}

const DEMAND = {
  volumeIndex: 72,
  growth90d: 0.184,
  growth12m: 0.3,
  direction: "rising" as const,
  series: series([40, 50, 60, 70]),
};

const COMPETITION = {
  listingCount: 24_000,
  top10SharePct: 38,
  entryBarrier: "low" as const,
};

function seed(term: string, overrides: Partial<DiscoverySeed> = {}): DiscoverySeed {
  return {
    term,
    category: "Haustier",
    kind: "niche",
    hint: "Mehrfach nachgefragt",
    ...overrides,
  };
}

/**
 * Ein Provider, der Kandidaten vorschlägt *und* sie bewerten kann – die
 * Kombination, die Discovery tatsächlich braucht.
 */
function testProvider(config: {
  id: SourceId;
  seeds?: DiscoverySeed[];
  payload?: (term: string) => ProviderPayload;
  calls?: Calls;
  discoverFails?: boolean;
  /** Lässt `discover` weg – prüft, dass reine Fetch-Quellen nicht stören. */
  fetchOnly?: boolean;
  priority?: number;
}): DataProvider {
  const provider: DataProvider = {
    id: config.id,
    label: `${config.id} (Test)`,
    capabilities: ["demand", "competition", "discovery"],
    kind: "mock",
    priority: config.priority ?? 10,
    isAvailable: () => true,
    fetch: async (query): Promise<ProviderResult> => {
      config.calls?.fetched.push(query.term);
      return {
        confidence: 0.9,
        synthetic: false,
        freshnessDays: 1,
        payload: config.payload?.(query.term) ?? { demand: DEMAND, competition: COMPETITION },
      };
    },
  };

  if (config.fetchOnly) return provider;

  return {
    ...provider,
    discover: async () => {
      if (config.calls) config.calls.discover += 1;
      if (config.discoverFails) throw new Error("Quelle nicht erreichbar");
      return config.seeds ?? [];
    },
  };
}

function calls(): Calls {
  return { discover: 0, fetched: [] };
}

// Der Cache lebt auf Modulebene und überdauert sonst den einzelnen Test.
beforeEach(resetDiscoveryCache);

describe("discoverOpportunities – Kandidatensammlung", () => {
  it("führt die Vorschläge mehrerer Quellen zusammen", async () => {
    const result = await discoverOpportunities({
      now: NOW,
      providers: [
        testProvider({ id: "reddit", seeds: [seed("Dackelkorb")] }),
        testProvider({ id: "pinterest", seeds: [seed("Katzenbaum")] }),
      ],
    });

    assert.deepEqual(
      result.map((o) => o.term).sort(),
      ["Dackelkorb", "Katzenbaum"],
    );
  });

  it("stellt mehrfach genannte Begriffe nach vorn", async () => {
    const scanned = calls();

    await discoverOpportunities({
      now: NOW,
      limit: 1,
      providers: [
        testProvider({ id: "reddit", seeds: [seed("Katzenbaum"), seed("Dackelkorb")], calls: scanned }),
        testProvider({ id: "pinterest", seeds: [seed("Dackelkorb")] }),
      ],
    });

    // Zwei Nennungen schlagen die Reihenfolge im Array – bei limit 1 wird
    // ausschließlich der bestätigte Begriff überhaupt bewertet.
    assert.deepEqual(scanned.fetched, ["Dackelkorb"]);
  });

  it("erkennt denselben Begriff trotz abweichender Schreibung", async () => {
    const result = await discoverOpportunities({
      now: NOW,
      providers: [
        testProvider({ id: "reddit", seeds: [seed("Dackelkorb")] }),
        testProvider({ id: "pinterest", seeds: [seed("dackelkorb")] }),
      ],
    });

    assert.equal(result.length, 1, "derselbe Markt darf nicht zweimal bewertet werden");
    // Verglichen wird kleingeschrieben, ausgegeben die ursprüngliche Schreibung.
    assert.equal(result[0]?.term, "Dackelkorb");
  });

  it("übersteht eine Quelle, die keine Vorschläge liefern kann", async () => {
    const result = await discoverOpportunities({
      now: NOW,
      providers: [
        testProvider({ id: "reddit", discoverFails: true }),
        testProvider({ id: "pinterest", seeds: [seed("Katzenbaum")] }),
      ],
    });

    assert.equal(result.length, 1);
    assert.equal(result[0]?.term, "Katzenbaum");
  });

  it("befragt nur Quellen, die überhaupt vorschlagen können", async () => {
    const fetchOnly = calls();

    const result = await discoverOpportunities({
      now: NOW,
      providers: [
        testProvider({ id: "reddit", seeds: [seed("Dackelkorb")] }),
        testProvider({ id: "ebay", fetchOnly: true, calls: fetchOnly }),
      ],
    });

    assert.equal(result.length, 1);
    // Die reine Fetch-Quelle liefert keine Kandidaten, bewertet aber mit.
    assert.deepEqual(fetchOnly.fetched, ["Dackelkorb"]);
  });

  it("liefert eine leere Liste, wenn keine Quelle etwas vorschlägt", async () => {
    const result = await discoverOpportunities({
      now: NOW,
      providers: [testProvider({ id: "reddit", seeds: [] })],
    });

    assert.deepEqual(result, []);
  });
});

describe("discoverOpportunities – Kostenbegrenzung", () => {
  it("bewertet höchstens so viele Kandidaten wie erlaubt", async () => {
    const scanned = calls();
    const seeds = ["A", "B", "C", "D", "E"].map((t) => seed(t));

    const result = await discoverOpportunities({
      now: NOW,
      limit: 2,
      providers: [testProvider({ id: "reddit", seeds, calls: scanned })],
    });

    // Der entscheidende Punkt: Das Limit greift vor dem Scan. Würde erst das
    // Ergebnis gekürzt, wären fünf Abrufe bezahlt und drei verworfen.
    assert.equal(scanned.fetched.length, 2, "es wurden mehr Kandidaten abgerufen als bewertet");
    assert.equal(result.length, 2);
  });

  it("verwirft Kandidaten ohne Nachfragesignal", async () => {
    const result = await discoverOpportunities({
      now: NOW,
      providers: [
        testProvider({
          id: "reddit",
          seeds: [seed("Messbar"), seed("Unbekannt")],
          payload: (term) =>
            term === "Unbekannt" ? { competition: COMPETITION } : { demand: DEMAND, competition: COMPETITION },
        }),
      ],
    });

    // Ohne Nachfrage gibt es nichts zu bewerten – ein Score wäre geraten.
    assert.deepEqual(result.map((o) => o.term), ["Messbar"]);
  });

  it("sortiert die Chancen absteigend nach Score", async () => {
    const result = await discoverOpportunities({
      now: NOW,
      providers: [
        testProvider({
          id: "reddit",
          seeds: [seed("Schwach"), seed("Stark")],
          payload: (term) =>
            term === "Stark"
              ? {
                  demand: { ...DEMAND, volumeIndex: 95, growth90d: 0.45, direction: "rising" },
                  competition: { ...COMPETITION, listingCount: 800 },
                }
              : {
                  demand: { ...DEMAND, volumeIndex: 6, growth90d: -0.4, direction: "declining" },
                  competition: { ...COMPETITION, listingCount: 900_000 },
                },
        }),
      ],
    });

    assert.deepEqual(result.map((o) => o.term), ["Stark", "Schwach"]);
    assert.ok((result[0]?.score ?? 0) > (result[1]?.score ?? 0));
  });
});

describe("discoverOpportunities – Saisonlage", () => {
  const withSeason = (peakMonths: number[]) =>
    testProvider({
      id: "reddit",
      seeds: [seed("Adventskalender")],
      payload: () => ({
        demand: DEMAND,
        competition: COMPETITION,
        seasonality: {
          amplitude: 0.62,
          monthlyIndex: Array.from({ length: 12 }, () => 1),
          peakMonths,
          lowMonths: [6],
          drivers: ["Weihnachten"],
        },
      }),
    });

  it("löst den nächsten Peak auf, nicht den ersten der Liste", async () => {
    const result = await discoverOpportunities({ now: NOW, providers: [withSeason([11, 5])] });

    // März: bis November sind es acht Monate, bis Mai zwei. Maßgeblich ist
    // der nähere Peak – auch wenn er hinten in der Liste steht.
    assert.equal(result[0]?.seasonality?.monthsToPeak, 2);
    assert.equal(result[0]?.seasonality?.nextPeakMonth, 5);
  });

  it("meldet einen laufenden Peak als Abstand null", async () => {
    const result = await discoverOpportunities({ now: NOW, providers: [withSeason([3])] });

    assert.equal(result[0]?.seasonality?.monthsToPeak, 0);
    assert.equal(result[0]?.seasonality?.nextPeakMonth, 3);
  });

  it("reicht die Amplitude durch", async () => {
    const result = await discoverOpportunities({ now: NOW, providers: [withSeason([11])] });

    assert.equal(result[0]?.seasonality?.amplitude, 0.62);
  });

  it("lässt die Saisonlage leer, wenn keine Quelle sie kennt", async () => {
    const result = await discoverOpportunities({
      now: NOW,
      providers: [testProvider({ id: "reddit", seeds: [seed("Dackelkorb")] })],
    });

    assert.equal(result[0]?.seasonality, undefined, "eine Saisonlage wurde erfunden");
  });
});

describe("discoverOpportunities – Belege und Begründung", () => {
  const single = (payload: ProviderPayload) =>
    testProvider({ id: "reddit", seeds: [seed("Dackelkorb")], payload: () => payload });

  it("nennt das Suchvolumen nur, wenn eine Quelle es kennt", async () => {
    const withVolume = await discoverOpportunities({
      now: NOW,
      providers: [single({ demand: { ...DEMAND, estimatedMonthlySearches: 36_200 }, competition: COMPETITION })],
    });
    const withoutVolume = await discoverOpportunities({
      now: NOW,
      limit: 17, // anderer Cache-Schlüssel
      providers: [single({ demand: DEMAND, competition: COMPETITION })],
    });

    assert.equal(withVolume[0]?.evidence[0], "Nachfrageindex 72/100 bei 36,2 Tsd. Suchen/Monat");
    assert.equal(withoutVolume[0]?.evidence[0], "Nachfrageindex 72/100");
  });

  it("schreibt die Entwicklung mit Vorzeichen und deutschem Dezimalkomma", async () => {
    const result = await discoverOpportunities({
      now: NOW,
      providers: [single({ demand: DEMAND, competition: COMPETITION })],
    });

    assert.equal(result[0]?.evidence[1], "Entwicklung +18,4 % in 90 Tagen");
  });

  it("sagt es, wenn zur Angebotsseite nichts vorliegt", async () => {
    const result = await discoverOpportunities({
      now: NOW,
      providers: [single({ demand: DEMAND })],
    });

    assert.equal(result[0]?.evidence[2], "Keine Wettbewerbsdaten verfügbar");
    assert.equal(result[0]?.saturationIndex, undefined);
  });

  it("nennt die Listing-Zahl, solange niemand die Sättigung einordnet", async () => {
    const result = await discoverOpportunities({
      now: NOW,
      providers: [single({ demand: DEMAND, competition: COMPETITION })],
    });

    assert.equal(result[0]?.evidence[2], "24,0 Tsd. Listings im Angebot");
  });

  it("nennt die Sättigung, sobald eine Quelle sie liefert", async () => {
    const result = await discoverOpportunities({
      now: NOW,
      providers: [single({ demand: DEMAND, competition: { ...COMPETITION, saturationIndex: 64 } })],
    });

    assert.equal(result[0]?.evidence[2], "Sättigung 64/100 bei 24,0 Tsd. Listings");
    assert.equal(result[0]?.saturationIndex, 64);
  });

  it("negiert eine fallende Nachfrage nicht doppelt", async () => {
    const result = await discoverOpportunities({
      now: NOW,
      providers: [
        single({ demand: { ...DEMAND, growth90d: -0.31, direction: "declining" }, competition: COMPETITION }),
      ],
    });

    const reason = result[0]?.reason ?? "";
    assert.match(reason, /Nachfrage fällt um 31,0 %/);
    assert.doesNotMatch(reason, /-31/, "die Richtung steckt bereits im Verb");
  });

  it("ordnet eine dünn besetzte Angebotsseite ein", async () => {
    const result = await discoverOpportunities({
      now: NOW,
      providers: [single({ demand: DEMAND, competition: { ...COMPETITION, saturationIndex: 30 } })],
    });

    assert.match(result[0]?.reason ?? "", /dünn besetzt/);
  });

  it("ordnet eine dichte Angebotsseite ein", async () => {
    const result = await discoverOpportunities({
      now: NOW,
      providers: [single({ demand: DEMAND, competition: { ...COMPETITION, saturationIndex: 85 } })],
    });

    assert.match(result[0]?.reason ?? "", /bereits dicht/);
  });

  it("schweigt zur Angebotsseite, wenn sie weder dünn noch dicht ist", async () => {
    const result = await discoverOpportunities({
      now: NOW,
      providers: [single({ demand: DEMAND, competition: { ...COMPETITION, saturationIndex: 65 } })],
    });

    const reason = result[0]?.reason ?? "";
    assert.doesNotMatch(reason, /dünn besetzt|bereits dicht/);
    assert.match(reason, /^Mehrfach nachgefragt/, "der Hinweis der Quelle muss erhalten bleiben");
  });

  it("verwendet in keinem erzeugten Text einen englischen Dezimalpunkt", async () => {
    const result = await discoverOpportunities({
      now: NOW,
      providers: [
        single({
          demand: { ...DEMAND, estimatedMonthlySearches: 36_200 },
          competition: { ...COMPETITION, saturationIndex: 64 },
        }),
      ],
    });

    for (const text of [result[0]?.reason ?? "", ...(result[0]?.evidence ?? [])]) {
      assert.doesNotMatch(text, /\d\.\d/, `englischer Dezimalpunkt in "${text}"`);
    }
  });
});

describe("discoverOpportunities – Kennung und Verlauf", () => {
  it("bildet aus dem Begriff eine URL-taugliche Kennung", async () => {
    const result = await discoverOpportunities({
      now: NOW,
      providers: [
        testProvider({ id: "reddit", seeds: [seed("Emaille-Tasse für Hündchen & Straße!")] }),
      ],
    });

    assert.equal(result[0]?.id, "emaille-tasse-fuer-huendchen-strasse");
  });

  it("kürzt den Verlauf auf die letzten zwölf Punkte", async () => {
    const long = series(Array.from({ length: 18 }, (_, i) => i + 1));

    const result = await discoverOpportunities({
      now: NOW,
      providers: [
        testProvider({
          id: "reddit",
          seeds: [seed("Dackelkorb")],
          payload: () => ({ demand: { ...DEMAND, series: long }, competition: COMPETITION }),
        }),
      ],
    });

    assert.equal(result[0]?.sparkline.length, 12);
    assert.equal(result[0]?.sparkline.at(-1), 18);
  });

  it("übernimmt Art und Kategorie des Vorschlags", async () => {
    const result = await discoverOpportunities({
      now: NOW,
      providers: [
        testProvider({
          id: "reddit",
          seeds: [seed("Adventskalender", { kind: "seasonal", category: "Geschenke" })],
        }),
      ],
    });

    assert.equal(result[0]?.kind, "seasonal");
    assert.equal(result[0]?.category, "Geschenke");
  });
});

describe("discoverOpportunities – Cache", () => {
  it("befragt die Quellen beim zweiten Aufruf nicht erneut", async () => {
    const scanned = calls();
    const providers = [testProvider({ id: "reddit", seeds: [seed("Dackelkorb")], calls: scanned })];

    await discoverOpportunities({ now: NOW, providers });
    await discoverOpportunities({ now: NOW, providers });

    assert.equal(scanned.discover, 1, "der Cache trägt nicht");
    assert.equal(scanned.fetched.length, 1);
  });

  it("erzwingt mit refresh eine neue Sammlung", async () => {
    const scanned = calls();
    const providers = [testProvider({ id: "reddit", seeds: [seed("Dackelkorb")], calls: scanned })];

    await discoverOpportunities({ now: NOW, providers });
    await discoverOpportunities({ now: NOW, providers, refresh: true });

    assert.equal(scanned.discover, 2);
  });

  it("hält Ergebnisse unterschiedlicher Größe auseinander", async () => {
    const scanned = calls();
    const seeds = [seed("A"), seed("B")];
    const providers = [testProvider({ id: "reddit", seeds, calls: scanned })];

    const one = await discoverOpportunities({ now: NOW, limit: 1, providers });
    const two = await discoverOpportunities({ now: NOW, limit: 2, providers });

    // Ein anderes Limit ist eine andere Frage – nicht dieselbe Antwort.
    assert.equal(one.length, 1);
    assert.equal(two.length, 2);
    assert.equal(scanned.discover, 2);
  });

  it("trennt die Ergebnisse verschiedener Tage", async () => {
    const scanned = calls();
    const providers = [testProvider({ id: "reddit", seeds: [seed("Dackelkorb")], calls: scanned })];

    await discoverOpportunities({ now: NOW, providers });
    await discoverOpportunities({ now: new Date("2026-03-16T12:00:00.000Z"), providers });

    assert.equal(scanned.discover, 2);
  });

  it("teilt eine laufende Sammlung unter gleichzeitigen Aufrufen", async () => {
    const scanned = calls();
    const providers = [testProvider({ id: "reddit", seeds: [seed("Dackelkorb")], calls: scanned })];

    await Promise.all([
      discoverOpportunities({ now: NOW, providers }),
      discoverOpportunities({ now: NOW, providers }),
    ]);

    // Zwei gleichzeitige Seitenaufrufe dürfen nicht doppelt zahlen.
    assert.equal(scanned.discover, 1);
  });
});

describe("trendMovers", () => {
  /** Acht Kandidaten mit gestaffeltem Wachstum, jeder zweite fallend. */
  function staggered(): DataProvider {
    const terms = Array.from({ length: 8 }, (_, i) => `Markt ${i}`);
    return testProvider({
      id: "reddit",
      seeds: terms.map((t) => seed(t)),
      payload: (term) => {
        const i = Number(term.split(" ")[1]);
        const rising = i % 2 === 0;
        return {
          demand: {
            ...DEMAND,
            volumeIndex: 50 + i,
            growth90d: rising ? 0.05 * (i + 1) : -0.2,
            direction: rising ? "rising" : "declining",
          },
          competition: { ...COMPETITION, saturationIndex: rising ? undefined : 50 + i },
        };
      },
    });
  }

  it("führt nur steigende Märkte als Aufsteiger", async () => {
    const { rising } = await trendMovers({ now: NOW, providers: [staggered()] });

    assert.ok(rising.length > 0);
    assert.ok(rising.every((m) => m.direction === "rising"));
  });

  it("sortiert die Aufsteiger nach Wachstum und deckelt sie bei sechs", async () => {
    const providers = [
      testProvider({
        id: "reddit",
        seeds: Array.from({ length: 9 }, (_, i) => seed(`Markt ${i}`)),
        payload: (term) => ({
          demand: { ...DEMAND, growth90d: 0.02 * (Number(term.split(" ")[1]) + 1), direction: "rising" },
          competition: COMPETITION,
        }),
      }),
    ];

    const { rising } = await trendMovers({ now: NOW, providers });

    assert.equal(rising.length, 6);
    const growth = rising.map((m) => m.growth90d);
    assert.deepEqual(growth, [...growth].sort((a, b) => b - a));
    // Der stärkste Aufsteiger ist der letzte Kandidat, nicht der erste.
    assert.equal(rising[0]?.term, "Markt 8");
  });

  it("lässt Kandidaten ohne Sättigungswert aus der Sättigungsliste", async () => {
    const { saturated } = await trendMovers({ now: NOW, providers: [staggered()] });

    assert.ok(saturated.length > 0);
    // Ein Markt, den niemand eingeordnet hat, stünde sonst nur deshalb in der
    // Rangfolge, weil er als 0 gelesen würde.
    assert.ok(saturated.every((m) => m.direction === "declining"));
    assert.ok(saturated.length <= 5);
  });

  it("liefert leere Listen, wenn es nichts zu melden gibt", async () => {
    const { rising, saturated } = await trendMovers({
      now: NOW,
      providers: [testProvider({ id: "reddit", seeds: [] })],
    });

    assert.deepEqual(rising, []);
    assert.deepEqual(saturated, []);
  });
});
