import "server-only";
import { clamp, median, percentile, round } from "@/domain/math";
import type { CompetitionSignal, EntryBarrier, PricingSignal } from "@/domain/types";
import { getConfig } from "@/server/config/env";
import type { DataProvider, ProviderResult } from "../types";
import { ProviderError } from "../types";
import { createLimiter } from "../util/concurrency";
import { CachedFailure, ProviderResponseCache } from "../util/response-cache";

/**
 * Etsy über die Open API v3 – der Leitmarkt für handgemachte Nischen.
 *
 * Was `GET /v3/application/listings/active` hergibt und was nicht:
 *
 * - **Preise** vollständig, je Listing als `{ amount, divisor, currency_code }`.
 * - **Trefferzahl** als `count` über den gesamten Bestand, nicht nur die Seite.
 * - **Konzentration** aus der Stichprobe über `shop_id`.
 * - **Listing-Alter** aus `original_creation_timestamp` – das ist der Grund,
 *   warum Etsy hier gebraucht wird. Keine andere angebundene Quelle datiert
 *   ihre Listings, und ohne Datum bleibt `marketAge` geschätzt.
 * - **Nicht messbar**: Zielgruppensegmente, Kaufmotive, Designmerkmale. Eine
 *   Listing-Liste beschreibt Angebote, keine Käufer. `audience` und `design`
 *   liefert diese Quelle deshalb nicht – anders als der gleichnamige Mock.
 * - **Keine Keywords**: `tags` sagt, womit Verkäufer auszeichnen, nicht was
 *   gesucht wird. Volumen, Wachstum und Wettbewerb stünden nirgends.
 * - **Kein Sättigungsindex**: wie bei eBay Sache des Scorings, das beide
 *   Marktseiten kennt.
 *
 * **Stichprobe und Sortierung.** `limit` ist bei Etsy auf 100 gedeckelt, und
 * `sort_on` steht standardmäßig auf `created` – die Voreinstellung lieferte
 * also die 100 jüngsten Treffer. Eine Preisverteilung daraus wäre schief und
 * ein Medianalter von wenigen Tagen schlicht falsch. Deshalb `sort_on=score`:
 * die Reihenfolge, die ein Käufer sieht.
 *
 * Alle abgeleiteten Größen beschreiben damit die **sichtbare** Konkurrenz,
 * nicht den Gesamtbestand. Für einen Neueinsteiger ist das die relevante
 * Grundgesamtheit – er konkurriert um die Plätze, die Käufer ansehen.
 *
 * Kontingent: ein Aufruf je Analyse.
 */

const ENDPOINT = "https://openapi.etsy.com/v3/application/listings/active";

/** Etsys Maximum. Höhere Werte weist die API ab. */
const PAGE_SIZE = "100";

/** Relevanz statt Erstellungsdatum – siehe Kopfkommentar. */
const SORT_ON = "score";

/** Unter dieser Zahl verwertbarer Preise entsteht keine Verteilung. */
const MIN_PRICES = 5;

const DAY_MS = 24 * 60 * 60 * 1000;

// --- Antwortform der Etsy-API (nur die gelesenen Felder) -------------------

interface EtsyPrice {
  amount?: number;
  divisor?: number;
  currency_code?: string;
}

export interface EtsyListing {
  listing_id?: number;
  shop_id?: number;
  price?: EtsyPrice;
  taxonomy_id?: number;
  /** Sekunden seit Epoch – Zeitpunkt der ersten Veröffentlichung. */
  original_creation_timestamp?: number;
}

export interface EtsyResponse {
  count?: number;
  results?: EtsyListing[];
  /** Etsy meldet Fehler als Klartext, teils unter `error`, teils `message`. */
  error?: string;
  message?: string;
}

/**
 * Ein Fehlschlag ist stabil, wenn er eine Eigenschaft der Anfrage ist.
 * Ein Ratenlimit oder ein ungültiger Schlüssel ist es nicht – beides sagt
 * nichts über den Suchbegriff aus und darf sich nicht einbrennen.
 */
function isStableFailure(error: unknown): boolean {
  return error instanceof ProviderError && /keine (Treffer|verwertbaren)/i.test(error.message);
}

let cache: ProviderResponseCache<ProviderResult> | undefined;
let limit: ReturnType<typeof createLimiter> | undefined;

// Erst beim ersten Aufruf erzeugen, nicht beim Laden des Moduls – sonst
// friert der Zustand ein, bevor resetConfig() in Tests greift.
function infrastructure() {
  const { providers, storage } = getConfig();
  cache ??= new ProviderResponseCache<ProviderResult>({
    namespace: "etsy",
    ttlMs: providers.cacheTtlMs,
    errorTtlMs: providers.cacheTtlMs * 2,
    dataDir: storage.dataDir,
    isStableFailure,
  });
  limit ??= createLimiter(providers.maxConcurrent);
  return { cache, limit };
}

/** Nur für Tests – verwirft Cache und Limiter samt Zustand. */
export function resetEtsyInfrastructure(): void {
  cache = undefined;
  limit = undefined;
}

export const etsyProvider: DataProvider = {
  id: "etsy",
  label: "Etsy",
  capabilities: ["competition", "pricing"],
  kind: "live",
  // Über eBay (12): Für handgemachte und personalisierte Nischen ist Etsy
  // der Leitmarkt, und nur Etsy datiert seine Listings.
  priority: 14,

  isAvailable(): boolean {
    return Boolean(getConfig().providers.keys.etsy);
  },

  async fetch(query, context): Promise<ProviderResult> {
    const { cache: responses, limit: run } = infrastructure();
    const key = query.term.trim().toLowerCase();

    try {
      return await responses.resolve(key, () => run(() => collect(query.term, context)));
    } catch (error) {
      if (error instanceof CachedFailure) {
        throw new ProviderError("etsy", error.message);
      }
      throw error;
    }
  },
};

async function collect(
  term: string,
  context: Parameters<DataProvider["fetch"]>[1],
): Promise<ProviderResult> {
  const apiKey = getConfig().providers.keys.etsy;
  if (!apiKey) {
    throw new ProviderError("etsy", "Kein ETSY_API_KEY konfiguriert");
  }

  const params = new URLSearchParams({
    keywords: term,
    limit: PAGE_SIZE,
    sort_on: SORT_ON,
    sort_order: "desc",
  });

  const response = await request(`${ENDPOINT}?${params}`, apiKey, context.signal);
  const listings = response.results ?? [];

  if (listings.length === 0) {
    throw new ProviderError("etsy", `keine Treffer für "${term}" auf Etsy`);
  }

  const { prices, currency } = extractPrices(listings);

  if (prices.length < MIN_PRICES) {
    throw new ProviderError(
      "etsy",
      `keine verwertbaren Preise (${prices.length} von ${listings.length} Treffern)`,
    );
  }

  // `count` ist der Gesamtbestand; fehlt er, ist die Stichprobe die einzige
  // belastbare Untergrenze.
  const listingCount = response.count ?? listings.length;

  const pricing = buildPricing(prices, currency);
  const competition = buildCompetition(listingCount, listings, pricing, context.now);

  context.logger.debug("Etsy ausgewertet", {
    term,
    listingCount,
    sample: listings.length,
    median: pricing.median,
    medianAgeDays: competition.medianListingAgeDays,
  });

  return {
    confidence: confidenceFor(listings.length),
    synthetic: false,
    freshnessDays: 0,
    message: `Live-Daten von Etsy – ${listings.length} Listings ausgewertet, ${listingCount.toLocaleString("de-DE")} Treffer gesamt.`,
    payload: { competition, pricing },
  };
}

// --- Abruf ----------------------------------------------------------------

async function request(url: string, apiKey: string, signal: AbortSignal): Promise<EtsyResponse> {
  let response: Response;
  try {
    response = await fetch(url, {
      signal,
      headers: { accept: "application/json", "x-api-key": apiKey },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new ProviderError("etsy", "Zeitüberschreitung beim Abruf", error);
    }
    throw new ProviderError("etsy", "Verbindung zu Etsy fehlgeschlagen", error);
  }

  if (!response.ok) {
    const hint =
      response.status === 401 || response.status === 403
        ? "ETSY_API_KEY ungültig oder nicht freigeschaltet"
        : response.status === 429
          ? "Etsy-Kontingent erschöpft"
          : `HTTP ${response.status}`;
    throw new ProviderError("etsy", `Abruf abgelehnt (${hint})`);
  }

  let parsed: EtsyResponse;
  try {
    parsed = (await response.json()) as EtsyResponse;
  } catch (error) {
    throw new ProviderError("etsy", "Antwort war kein gültiges JSON", error);
  }

  const message = parsed.error ?? parsed.message;
  if (message) {
    throw new ProviderError("etsy", message);
  }

  return parsed;
}

// --- Aufbereitung ---------------------------------------------------------

/**
 * Preise der Stichprobe, auf die häufigste Währung eingeschränkt.
 *
 * Etsy ist ein globaler Marktplatz: Eine Trefferliste mischt Shops aus
 * verschiedenen Währungsräumen. Beträge ohne Umrechnung in einen Topf zu
 * werfen ergäbe eine Verteilung, die es nirgends gibt – und Kurse hat diese
 * Anwendung nicht. Also gewinnt die dominante Währung, der Rest fällt raus.
 */
export function extractPrices(listings: EtsyListing[]): { prices: number[]; currency: string } {
  const byCurrency = new Map<string, number[]>();

  for (const listing of listings) {
    const value = priceOf(listing);
    const code = listing.price?.currency_code;
    if (value === undefined || !code) continue;
    const bucket = byCurrency.get(code) ?? [];
    bucket.push(value);
    byCurrency.set(code, bucket);
  }

  let currency = "EUR";
  let prices: number[] = [];
  for (const [code, values] of byCurrency) {
    if (values.length > prices.length) {
      currency = code;
      prices = values;
    }
  }

  return { prices, currency };
}

/** `amount` ist ein Ganzzahlbetrag, `divisor` die zugehörige Zehnerpotenz. */
function priceOf(listing: EtsyListing): number | undefined {
  const amount = listing.price?.amount;
  const divisor = listing.price?.divisor;
  if (typeof amount !== "number" || typeof divisor !== "number" || divisor <= 0) return undefined;
  const value = amount / divisor;
  return value > 0 ? value : undefined;
}

function buildPricing(prices: number[], currency: string): PricingSignal {
  return {
    currency,
    min: round(Math.min(...prices), 2),
    p25: round(percentile(prices, 0.25), 2),
    median: round(median(prices), 2),
    p75: round(percentile(prices, 0.75), 2),
    max: round(Math.max(...prices), 2),
    // avgReviewsPerListing bleibt leer: Etsy weist Bewertungen je Shop aus,
    // nicht je Listing. `num_favorers` ist etwas anderes – Merkzettel, keine
    // Bewertung – und wäre in diesem Feld eine Falschaussage.
  };
}

export function buildCompetition(
  listingCount: number,
  listings: EtsyListing[],
  pricing: PricingSignal,
  now: Date,
): CompetitionSignal {
  const ages = listingAges(listings, now);

  return {
    listingCount,
    top10SharePct: topShopShare(listings),
    entryBarrier: barrierFor(pricing),
    medianListingAgeDays: ages.length === 0 ? undefined : Math.round(median(ages)),
    newListings30dPct:
      ages.length === 0
        ? undefined
        : round((ages.filter((days) => days <= 30).length / ages.length) * 100, 1),
    // activeSellers bleibt leer: Die Zahl der Shops in einer Stichprobe von
    // 100 ist nicht die Zahl der Anbieter im Markt.
    // saturationIndex bleibt leer: Normierung ist Sache des Scorings.
  };
}

/** Alter der Listings in Tagen, gemessen an der ersten Veröffentlichung. */
function listingAges(listings: EtsyListing[], now: Date): number[] {
  const ages: number[] = [];

  for (const listing of listings) {
    const seconds = listing.original_creation_timestamp;
    if (typeof seconds !== "number" || seconds <= 0) continue;
    const days = (now.getTime() - seconds * 1000) / DAY_MS;
    // Ein Listing aus der Zukunft ist ein Datenfehler, kein junger Markt.
    if (days >= 0) ages.push(days);
  }

  return ages;
}

/**
 * Anteil der zehn häufigsten Shops an der Stichprobe, in Prozent.
 *
 * Wie bei eBay die Sichtbarkeitsverteilung dort, wo Käufer hinsehen – nicht
 * die Konzentration im Gesamtmarkt.
 */
export function topShopShare(listings: EtsyListing[]): number {
  const counts = new Map<number, number>();
  for (const listing of listings) {
    const shop = listing.shop_id;
    if (typeof shop !== "number") continue;
    counts.set(shop, (counts.get(shop) ?? 0) + 1);
  }

  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  if (total === 0) return 0;

  const topTen = [...counts.values()]
    .sort((a, b) => b - a)
    .slice(0, 10)
    .reduce((sum, count) => sum + count, 0);

  return round(clamp((topTen / total) * 100, 0, 100), 1);
}

/** Einstiegshürde aus dem Preisniveau – Einordnung, keine Messung. */
function barrierFor(pricing: PricingSignal): EntryBarrier {
  if (pricing.median >= 120) return "high";
  if (pricing.median >= 40) return "medium";
  return "low";
}

/** Eine breitere Stichprobe trägt eine belastbarere Verteilung. */
function confidenceFor(sample: number): number {
  if (sample >= 90) return 0.84;
  if (sample >= 50) return 0.76;
  if (sample >= 20) return 0.64;
  return 0.5;
}
