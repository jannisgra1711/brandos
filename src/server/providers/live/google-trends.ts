import "server-only";
import { clamp, mean, pctChange, round } from "@/domain/math";
import type {
  DemandSignal,
  SeasonalitySignal,
  TimePoint,
  TrendDirection,
} from "@/domain/types";
import { getConfig } from "@/server/config/env";
import type { DataProvider, ProviderResult } from "../types";
import { ProviderError } from "../types";
import { createLimiter } from "../util/concurrency";
import { CachedFailure, ProviderResponseCache } from "../util/response-cache";

/**
 * Google Trends über SerpAPI – die erste echte Datenquelle.
 *
 * Was diese Quelle kann und was nicht, prägt den gesamten Vertrag:
 *
 * - Trends misst **relative** Nachfrage. Der gelieferte Index ist auf das
 *   Maximum des angefragten Zeitraums normiert, nicht auf ein Suchvolumen.
 *   Deshalb bleibt `estimatedMonthlySearches` leer statt hochgerechnet.
 * - Ein einziger Abruf über fünf Jahre trägt beides: den jüngeren Verlauf für
 *   `demand.series` und genug Jahre, um Saisonalität aus wiederkehrenden
 *   Mustern statt aus einem einzelnen Jahr abzuleiten.
 * - `related_queries` wäre ein zweiter Abruf und liefert keinen
 *   Wettbewerbswert je Keyword. Solange `KeywordSignal.competition` Pflicht
 *   ist, blieben nur erfundene Zahlen – deshalb keine `keywords`-Fähigkeit.
 *
 * Kontingent: genau ein SerpAPI-Aufruf je Analyse.
 *
 * ---
 *
 * **Keine `discovery`-Fähigkeit – zwei Wege wurden geprüft und verworfen:**
 *
 * Die Engine `google_trends_trending_now` ist nachrichtengetrieben. Ihre
 * Kategorien sind Sport, Games, Technik, Unterhaltung, Recht und Politik –
 * keine einzige für Konsum, Haus oder Hobby.
 *
 * Steigende verwandte Suchanfragen (`RELATED_QUERIES`, Liste `rising`) zu
 * breiten Ankerbegriffen wurden implementiert und gegen die echte API
 * gemessen: von acht Kandidaten war *einer* ein Markt („Geschenk zum
 * Vatertag"). Der Rest waren Markennamen („Froplay Hund"), Personen („Hund
 * Jette"), Buchtitel („Das Geschenk des Meeres"), Nachrichten („ADAC 122
 * Jahre Geschenk", „Meteorit") und Floskeln („Das perfekte Geschenk").
 *
 * Das ist kein Filterproblem: Die Liste bildet *Aufmerksamkeit* ab, nicht
 * Kaufabsicht. Kein Textfilter unterscheidet „Froplay Hund" von
 * „Adventskalender Hund". Wer es erneut versucht, braucht eine Quelle mit
 * kommerziellem Signal – Marktplatz-Suchvorschläge etwa, nicht Google
 * Trends.
 */

const ENDPOINT = "https://serpapi.com/search.json";

/** Fünf Jahre liefern vier bis fünf vollständige Saisonzyklen. */
const WINDOW = "today 5-y";

/**
 * „Kennt Google Trends nicht" ist eine Eigenschaft des Begriffs, keine
 * Störung – ein erneuter Abruf würde dieselbe Antwort kosten. Der
 * Discovery-Scan sieht dieselben Kandidaten immer wieder; ohne diese Regel
 * wären tote Begriffe die teuersten im Lauf.
 */
function isStableFailure(error: unknown): boolean {
  return error instanceof ProviderError && /returned any results/i.test(error.message);
}

let cache: ProviderResponseCache<ProviderResult> | undefined;
let limit: ReturnType<typeof createLimiter> | undefined;

/**
 * Cache und Limiter lesen die Konfiguration – deshalb erst beim ersten
 * Aufruf erzeugen, nicht beim Laden des Moduls. Sonst friert der Zustand
 * ein, bevor `resetConfig()` in Tests greifen kann.
 */
function infrastructure() {
  const { providers } = getConfig();
  cache ??= new ProviderResponseCache<ProviderResult>({
    namespace: "google-trends",
    ttlMs: providers.cacheTtlMs,
    // Tote Begriffe länger halten: die Antwort ändert sich seltener als
    // die Zahlen eines lebendigen Marktes.
    errorTtlMs: providers.cacheTtlMs * 2,
    dataDir: getConfig().storage.dataDir,
    isStableFailure,
  });
  limit ??= createLimiter(providers.maxConcurrent);
  return { cache, limit };
}

/** Nur für Tests – verwirft Cache und Limiter samt Zustand. */
export function resetGoogleTrendsInfrastructure(): void {
  cache = undefined;
  limit = undefined;
}

// --- Antwortform von SerpAPI (nur die Felder, die wir lesen) ---------------
// Bewusst durchgehend optional: die Struktur gehört einem fremden Dienst.
// Jede Annahme über ihre Vollständigkeit wird unten explizit geprüft.

interface TimelineValue {
  extracted_value?: number;
}

interface TimelineEntry {
  timestamp?: string;
  values?: TimelineValue[];
}

interface TrendsResponse {
  error?: string;
  search_metadata?: { status?: string };
  interest_over_time?: { timeline_data?: TimelineEntry[] };
}

export const googleTrendsProvider: DataProvider = {
  id: "google-trends",
  label: "Google Trends",
  capabilities: ["demand"],
  kind: "live",
  priority: 20,

  isAvailable(): boolean {
    return Boolean(getConfig().providers.keys.serpApi);
  },

  async fetch(query, context): Promise<ProviderResult> {
    const { cache: responses, limit: run } = infrastructure();
    const market = query.market ?? "DE";
    const windowMonths = query.windowMonths ?? 24;

    // Das Fenster gehört in den Schlüssel: dieselbe Suche mit anderem
    // Zeitraum ist eine andere Antwort.
    const key = `${query.term.trim().toLowerCase()}|${market}|${windowMonths}`;

    try {
      return await responses.resolve(key, () => run(() => collect(query, market, windowMonths, context)));
    } catch (error) {
      // Ein Fehlschlag aus dem Cache soll sich für den Aggregator genauso
      // verhalten wie ein frischer – gleicher Typ, gleiche Meldung.
      if (error instanceof CachedFailure) {
        throw new ProviderError("google-trends", error.message);
      }
      throw error;
    }
  },
};

async function collect(
  query: Parameters<DataProvider["fetch"]>[0],
  market: string,
  windowMonths: number,
  context: Parameters<DataProvider["fetch"]>[1],
): Promise<ProviderResult> {
  const apiKey = getConfig().providers.keys.serpApi;
  if (!apiKey) {
    throw new ProviderError("google-trends", "Kein SERPAPI_KEY konfiguriert");
  }

  const params = new URLSearchParams({
    engine: "google_trends",
    q: query.term,
    data_type: "TIMESERIES",
    date: WINDOW,
    geo: market,
    hl: "de",
    api_key: apiKey,
  });

  const response = await request(`${ENDPOINT}?${params}`, context.signal);

  if (response.error) {
    // SerpAPI meldet „keine Ergebnisse" als Fehlertext. Das ist eine
    // Aussage über den Markt, keine Störung – für den Aggregator bleibt es
    // trotzdem ein Ausfall dieser Quelle, damit es im Protokoll steht.
    throw new ProviderError("google-trends", response.error);
  }

  const timeline = response.interest_over_time?.timeline_data ?? [];
  const monthly = toMonthlySeries(timeline);

  if (monthly.length < 6) {
    throw new ProviderError(
      "google-trends",
      `Zu wenige Datenpunkte für eine Trendaussage (${monthly.length} Monate)`,
    );
  }

  const demand = buildDemand(monthly, windowMonths);
  const seasonality = buildSeasonality(monthly);

  context.logger.debug("Google Trends ausgewertet", {
    term: query.term,
    months: monthly.length,
    volumeIndex: demand.volumeIndex,
    direction: demand.direction,
  });

  return {
    confidence: confidenceFor(monthly.length),
    synthetic: false,
    // Trends aktualisiert die letzte Woche laufend; ein bis zwei Tage
    // Verzug sind der Normalfall.
    freshnessDays: 2,
    message: `Live-Daten aus Google Trends (${monthly.length} Monate). Relativer Index, kein absolutes Suchvolumen.`,
    payload: { demand, seasonality },
  };
}

// --- Abruf ----------------------------------------------------------------

async function request(url: string, signal: AbortSignal): Promise<TrendsResponse> {
  let response: Response;
  try {
    response = await fetch(url, { signal, headers: { accept: "application/json" } });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new ProviderError("google-trends", "Zeitüberschreitung beim Abruf", error);
    }
    throw new ProviderError("google-trends", "Verbindung zu SerpAPI fehlgeschlagen", error);
  }

  if (!response.ok) {
    // 401 und 429 sind die beiden Fälle, die den Nutzer wirklich betreffen:
    // falscher Key und aufgebrauchtes Kontingent.
    const hint =
      response.status === 401
        ? "SERPAPI_KEY ungültig"
        : response.status === 429
          ? "SerpAPI-Kontingent erschöpft"
          : `HTTP ${response.status}`;
    throw new ProviderError("google-trends", `Abruf abgelehnt (${hint})`);
  }

  try {
    return (await response.json()) as TrendsResponse;
  } catch (error) {
    throw new ProviderError("google-trends", "Antwort war kein gültiges JSON", error);
  }
}

// --- Aufbereitung ---------------------------------------------------------

/**
 * Wochenwerte zu Monatsmitteln verdichten.
 *
 * Gruppiert wird über `timestamp` (Unix-Sekunden), nicht über `date`: das
 * Datumsfeld ist ein lokalisierter Bereichstext ("1.–7. Jan. 2023"), dessen
 * Form sich mit `hl` ändert.
 */
function toMonthlySeries(timeline: TimelineEntry[]): TimePoint[] {
  const buckets = new Map<string, number[]>();

  for (const entry of timeline) {
    const seconds = Number.parseInt(entry.timestamp ?? "", 10);
    const value = entry.values?.[0]?.extracted_value;
    if (!Number.isFinite(seconds) || typeof value !== "number") continue;

    const date = new Date(seconds * 1000);
    const period = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    const bucket = buckets.get(period);
    if (bucket) bucket.push(value);
    else buckets.set(period, [value]);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, values]) => ({ period, value: round(mean(values), 1) }));
}

function buildDemand(monthly: TimePoint[], windowMonths: number): DemandSignal {
  const values = monthly.map((p) => p.value);

  // Der Index ist bereits auf 0..100 normiert. Die letzten drei Monate
  // glätten die Wochenschwankung, ohne den aktuellen Stand zu verwischen.
  const volumeIndex = round(clamp(mean(values.slice(-3))), 1);

  const recent = mean(values.slice(-3));
  const previous = mean(values.slice(-6, -3));
  const growth90d = values.length >= 6 ? round(pctChange(previous, recent), 3) : 0;

  // Jahresvergleich gegen denselben Zeitraum des Vorjahres – sonst mäße man
  // bei saisonalen Märkten die Saison statt der Entwicklung.
  const yearAgo = mean(values.slice(-15, -12));
  const growth12m = values.length >= 15 ? round(pctChange(yearAgo, recent), 3) : 0;

  return {
    volumeIndex,
    // estimatedMonthlySearches bleibt bewusst leer – siehe Kopfkommentar.
    growth90d,
    growth12m,
    direction: resolveDirection(values, growth90d, growth12m),
    series: monthly.slice(-windowMonths),
  };
}

/**
 * Richtung aus beiden Zeiträumen plus Streuung.
 *
 * `direction` ist die maßgebliche Trendaussage im Produkt – sie darf den
 * Wachstumsraten nicht widersprechen. Deshalb wird „volatil" zuerst geprüft:
 * ein stark schwankender Markt ist weder steigend noch fallend, auch wenn
 * eine einzelne Rate das nahelegt.
 */
function resolveDirection(
  values: number[],
  growth90d: number,
  growth12m: number,
): TrendDirection {
  const recent = values.slice(-12);
  const average = mean(recent);
  if (average > 0) {
    const deviation = Math.sqrt(mean(recent.map((v) => (v - average) ** 2)));
    if (deviation / average > 0.35) return "volatile";
  }

  const combined = growth90d * 0.6 + growth12m * 0.4;
  if (combined > 0.08) return "rising";
  if (combined < -0.08) return "declining";
  return "stable";
}

/**
 * Saisonalität aus dem Mehrjahresmittel je Kalendermonat.
 *
 * Ein einzelnes Jahr genügt nicht: ein einmaliger Ausreißer wäre von einem
 * wiederkehrenden Peak nicht zu unterscheiden. Über mehrere Jahre gemittelt
 * überlebt nur, was sich wiederholt.
 */
function buildSeasonality(monthly: TimePoint[]): SeasonalitySignal {
  const byMonth = new Map<number, number[]>();

  for (const point of monthly) {
    const month = Number.parseInt(point.period.slice(5, 7), 10);
    if (!Number.isFinite(month)) continue;
    const bucket = byMonth.get(month);
    if (bucket) bucket.push(point.value);
    else byMonth.set(month, [point.value]);
  }

  const overall = mean(monthly.map((p) => p.value));
  const monthlyIndex: number[] = [];

  for (let month = 1; month <= 12; month += 1) {
    const values = byMonth.get(month);
    // Fehlt ein Monat vollständig, gilt er als durchschnittlich – das ist
    // die einzige Annahme, die den Verlauf nicht verzerrt.
    const factor = values && values.length > 0 && overall > 0 ? mean(values) / overall : 1;
    monthlyIndex.push(round(factor, 3));
  }

  const spread = Math.max(...monthlyIndex) - Math.min(...monthlyIndex);
  const amplitude = round(clamp(spread / 2, 0, 1), 3);

  const peakMonths = selectMonths(monthlyIndex, (factor) => factor >= 1 + amplitude * 0.5, "desc");
  const lowMonths = selectMonths(monthlyIndex, (factor) => factor <= 1 - amplitude * 0.5, "asc");

  return {
    amplitude,
    monthlyIndex,
    peakMonths,
    lowMonths,
    // Trends erklärt nicht, *warum* ein Monat heraussticht. Eine Zuordnung
    // zu Anlässen wäre geraten – das bleibt anderen Quellen überlassen.
    drivers: [],
  };
}

function selectMonths(
  monthlyIndex: number[],
  matches: (factor: number) => boolean,
  order: "asc" | "desc",
): number[] {
  return monthlyIndex
    .map((factor, index) => ({ month: index + 1, factor }))
    .filter((entry) => matches(entry.factor))
    .sort((a, b) => (order === "desc" ? b.factor - a.factor : a.factor - b.factor))
    .slice(0, 3)
    .map((entry) => entry.month)
    .sort((a, b) => a - b);
}

/** Mehr Historie heißt belastbarere Saisonaussage. */
function confidenceFor(months: number): number {
  if (months >= 48) return 0.92;
  if (months >= 24) return 0.85;
  if (months >= 12) return 0.72;
  return 0.55;
}
