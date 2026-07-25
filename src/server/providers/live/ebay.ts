import "server-only";
import { clamp, median, percentile, round } from "@/domain/math";
import type { CompetitionSignal, EntryBarrier, PricingSignal } from "@/domain/types";
import { getConfig } from "@/server/config/env";
import type { DataProvider, ProviderResult } from "../types";
import { ProviderError } from "../types";
import { createLimiter } from "../util/concurrency";
import { CachedFailure, ProviderResponseCache } from "../util/response-cache";

/**
 * eBay über SerpAPI – die Angebotsseite.
 *
 * Was eine Suchergebnisliste hergibt und was nicht:
 *
 * - **Preise** vollständig. Jedes Listing nennt seinen Preis; daraus ergibt
 *   sich eine echte Verteilung statt einer geschätzten Spanne.
 * - **Listing-Zahl** als Gesamttreffer, nicht nur als Seitenausschnitt.
 * - **Konzentration** aus der Stichprobe: wie viele Listings entfallen auf
 *   die zehn häufigsten Anbieter. Das misst die Sichtbarkeitsverteilung dort,
 *   wo Käufer tatsächlich hinsehen – auf den ersten Seiten.
 * - **Nicht messbar**: Alter der Listings, Neuzugänge der letzten 30 Tage,
 *   und die Gesamtzahl der Anbieter jenseits der Stichprobe. Diese Felder
 *   bleiben leer statt hochgerechnet.
 * - **Kein Sättigungsindex**: Die Trefferzahl allein sagt nichts über das
 *   Verhältnis zur Nachfrage. Die Normierung übernimmt das Scoring, das
 *   beide Seiten kennt.
 *
 * Kontingent: ein SerpAPI-Aufruf je Analyse.
 */

const ENDPOINT = "https://serpapi.com/search.json";

/** 200 ist das Maximum je Seite – eine breitere Stichprobe für denselben Aufruf. */
const PAGE_SIZE = "200";

/** Sponsored-Treffer sind bezahlte Platzierungen, keine Marktstichprobe. */
const EXCLUDE_SPONSORED = true;

const DOMAINS: Record<string, { domain: string; currency: string }> = {
  DE: { domain: "ebay.de", currency: "EUR" },
  AT: { domain: "ebay.at", currency: "EUR" },
  CH: { domain: "ebay.ch", currency: "CHF" },
  US: { domain: "ebay.com", currency: "USD" },
  GB: { domain: "ebay.co.uk", currency: "GBP" },
  FR: { domain: "ebay.fr", currency: "EUR" },
  IT: { domain: "ebay.it", currency: "EUR" },
  ES: { domain: "ebay.es", currency: "EUR" },
};

const FALLBACK_MARKET = DOMAINS.DE as { domain: string; currency: string };

// --- Antwortform von SerpAPI (nur die gelesenen Felder) --------------------

interface PriceValue {
  raw?: string;
  extracted?: number;
}

interface EbayPrice extends PriceValue {
  from?: PriceValue;
  to?: PriceValue;
}

interface EbayResult {
  price?: EbayPrice;
  condition?: string;
  sponsored?: boolean;
  // `reviews` wird bewusst nicht gelesen – siehe buildPricing.
  seller?: { username?: string };
}

interface EbayResponse {
  error?: string;
  search_information?: { total_results?: number };
  organic_results?: EbayResult[];
}

function isStableFailure(error: unknown): boolean {
  return error instanceof ProviderError && /keine (Treffer|verwertbaren)/i.test(error.message);
}

let cache: ProviderResponseCache<ProviderResult> | undefined;
let limit: ReturnType<typeof createLimiter> | undefined;

function infrastructure() {
  const { providers, storage } = getConfig();
  cache ??= new ProviderResponseCache<ProviderResult>({
    namespace: "ebay",
    ttlMs: providers.cacheTtlMs,
    errorTtlMs: providers.cacheTtlMs * 2,
    dataDir: storage.dataDir,
    isStableFailure,
  });
  limit ??= createLimiter(providers.maxConcurrent);
  return { cache, limit };
}

/** Nur für Tests – verwirft Cache und Limiter samt Zustand. */
export function resetEbayInfrastructure(): void {
  cache = undefined;
  limit = undefined;
}

export const ebayProvider: DataProvider = {
  id: "ebay",
  label: "eBay",
  capabilities: ["competition", "pricing"],
  kind: "live",
  // Über den Marktplatz-Mocks (Etsy 10, Amazon 8), damit echte Messungen
  // die synthetischen überstimmen. Unterhalb dessen, wo ein echter
  // Etsy-Zugang läge: für handgemachte Nischen ist Etsy der Leitmarkt.
  priority: 12,

  isAvailable(): boolean {
    return Boolean(getConfig().providers.keys.serpApi);
  },

  async fetch(query, context): Promise<ProviderResult> {
    const { cache: responses, limit: run } = infrastructure();
    const market = (query.market ?? "DE").toUpperCase();
    const key = `${query.term.trim().toLowerCase()}|${market}`;

    try {
      return await responses.resolve(key, () => run(() => collect(query.term, market, context)));
    } catch (error) {
      if (error instanceof CachedFailure) {
        throw new ProviderError("ebay", error.message);
      }
      throw error;
    }
  },
};

async function collect(
  term: string,
  market: string,
  context: Parameters<DataProvider["fetch"]>[1],
): Promise<ProviderResult> {
  const apiKey = getConfig().providers.keys.serpApi;
  if (!apiKey) {
    throw new ProviderError("ebay", "Kein SERPAPI_KEY konfiguriert");
  }

  const target = DOMAINS[market] ?? FALLBACK_MARKET;

  const params = new URLSearchParams({
    engine: "ebay",
    _nkw: term,
    ebay_domain: target.domain,
    _ipg: PAGE_SIZE,
    api_key: apiKey,
  });

  const response = await request(`${ENDPOINT}?${params}`, context.signal);

  if (response.error) {
    throw new ProviderError("ebay", response.error);
  }

  const all = response.organic_results ?? [];
  const results = EXCLUDE_SPONSORED ? all.filter((r) => r.sponsored !== true) : all;

  if (results.length === 0) {
    throw new ProviderError("ebay", `keine Treffer für "${term}" auf ${target.domain}`);
  }

  const prices = results.map(priceOf).filter((p): p is number => p !== undefined && p > 0);

  if (prices.length < 5) {
    throw new ProviderError(
      "ebay",
      `keine verwertbaren Preise (${prices.length} von ${results.length} Treffern)`,
    );
  }

  // Die Gesamttrefferzahl steht in der Antwort; fehlt sie, ist die
  // Stichprobe die einzige belastbare Untergrenze.
  const listingCount = response.search_information?.total_results ?? results.length;

  const pricing = buildPricing(prices, currencyOf(results) ?? target.currency);
  const competition = buildCompetition(listingCount, results, pricing);

  context.logger.debug("eBay ausgewertet", {
    term,
    domain: target.domain,
    listingCount,
    sample: results.length,
    median: pricing.median,
  });

  return {
    // Eine Stichprobe von wenigen hundert Listings trägt eine
    // Preisverteilung gut, eine Aussage über den Gesamtmarkt weniger.
    confidence: confidenceFor(results.length),
    synthetic: false,
    freshnessDays: 0,
    message: `Live-Daten von ${target.domain} – ${results.length} Listings ausgewertet, ${listingCount.toLocaleString("de-DE")} Treffer gesamt.`,
    payload: { competition, pricing },
  };
}

// --- Abruf ----------------------------------------------------------------

async function request(url: string, signal: AbortSignal): Promise<EbayResponse> {
  let response: Response;
  try {
    response = await fetch(url, { signal, headers: { accept: "application/json" } });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new ProviderError("ebay", "Zeitüberschreitung beim Abruf", error);
    }
    throw new ProviderError("ebay", "Verbindung zu SerpAPI fehlgeschlagen", error);
  }

  if (!response.ok) {
    const hint =
      response.status === 401
        ? "SERPAPI_KEY ungültig"
        : response.status === 429
          ? "SerpAPI-Kontingent erschöpft"
          : `HTTP ${response.status}`;
    throw new ProviderError("ebay", `Abruf abgelehnt (${hint})`);
  }

  try {
    return (await response.json()) as EbayResponse;
  } catch (error) {
    throw new ProviderError("ebay", "Antwort war kein gültiges JSON", error);
  }
}

// --- Aufbereitung ---------------------------------------------------------

/**
 * Preis eines Listings. Bei Spannen ("EUR 12,00 bis EUR 30,00") zählt die
 * Mitte – das ist die neutralste Annahme über ein Angebot mit Varianten.
 */
function priceOf(result: EbayResult): number | undefined {
  const price = result.price;
  if (!price) return undefined;
  if (typeof price.extracted === "number") return price.extracted;

  const from = price.from?.extracted;
  const to = price.to?.extracted;
  if (typeof from === "number" && typeof to === "number") return (from + to) / 2;
  return from ?? to;
}

/** Währung aus dem ersten Rohpreis, der eine erkennen lässt. */
function currencyOf(results: EbayResult[]): string | undefined {
  for (const result of results) {
    const raw = result.price?.raw ?? result.price?.from?.raw;
    if (!raw) continue;
    if (raw.includes("EUR") || raw.includes("€")) return "EUR";
    if (raw.includes("CHF")) return "CHF";
    if (raw.includes("£")) return "GBP";
    if (raw.includes("$")) return "USD";
  }
  return undefined;
}

function buildPricing(prices: number[], currency: string): PricingSignal {
  return {
    currency,
    min: round(Math.min(...prices), 2),
    p25: round(percentile(prices, 0.25), 2),
    median: round(median(prices), 2),
    p75: round(percentile(prices, 0.75), 2),
    max: round(Math.max(...prices), 2),
    // avgReviewsPerListing bleibt leer: `seller.reviews` ist die
    // Lebenszeit-Bewertungszahl des Verkäufers über alle seine Angebote
    // hinweg, nicht die eines Listings. Eingesetzt ergäbe das fünfstellige
    // Werte in einem Feld, das einstellige erwartet.
  };
}

function buildCompetition(
  listingCount: number,
  results: EbayResult[],
  pricing: PricingSignal,
): CompetitionSignal {
  return {
    listingCount,
    top10SharePct: topSellerShare(results),
    entryBarrier: barrierFor(pricing),
    // activeSellers, saturationIndex, medianListingAgeDays und
    // newListings30dPct bleiben leer – siehe Kopfkommentar.
  };
}

/**
 * Anteil der zehn häufigsten Anbieter an der Stichprobe, in Prozent.
 *
 * Gemessen wird die Konzentration unter den sichtbaren Treffern, nicht im
 * Gesamtmarkt. Das ist die Zahl, die für einen Neueinsteiger zählt: sie
 * beschreibt, wie viel Platz auf den Seiten ist, die Käufer ansehen.
 */
function topSellerShare(results: EbayResult[]): number {
  const counts = new Map<string, number>();
  for (const result of results) {
    const seller = result.seller?.username;
    if (!seller) continue;
    counts.set(seller, (counts.get(seller) ?? 0) + 1);
  }

  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  if (total === 0) return 0;

  const topTen = [...counts.values()]
    .sort((a, b) => b - a)
    .slice(0, 10)
    .reduce((sum, count) => sum + count, 0);

  return round(clamp((topTen / total) * 100, 0, 100), 1);
}

/**
 * Einstiegshürde aus dem Preisniveau.
 *
 * Ein hochpreisiger Markt bindet Kapital je Einheit und verzeiht
 * Fehlentscheidungen im Sortiment schlechter. Das ist eine Einordnung,
 * keine Messung – deshalb grob gestuft statt fein gerechnet.
 */
function barrierFor(pricing: PricingSignal): EntryBarrier {
  if (pricing.median >= 120) return "high";
  if (pricing.median >= 40) return "medium";
  return "low";
}

/** Eine breitere Stichprobe trägt eine belastbarere Verteilung. */
function confidenceFor(sample: number): number {
  if (sample >= 150) return 0.86;
  if (sample >= 80) return 0.78;
  if (sample >= 30) return 0.66;
  return 0.5;
}
