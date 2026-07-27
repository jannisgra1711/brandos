import "server-only";
import { round } from "@/domain/math";
import type { MarketCategory, MarketCategorySignal } from "@/domain/types";
import { getConfig } from "@/server/config/env";
import { ProviderError } from "../types";
import { ProviderResponseCache } from "../util/response-cache";
import type { EtsyListing } from "./etsy";

/**
 * Etsys Verkäufer-Taxonomie – wo der Marktplatz einen Markt einsortiert.
 *
 * `GET /v3/application/seller-taxonomy/nodes` liefert den vollständigen Baum:
 * **3065 Knoten, davon 2503 Blätter, maximal sechs Ebenen**. Jedes Listing
 * nennt über `taxonomy_id` sein Blatt. Beides zusammen ergibt eine gemessene
 * Einordnung der Trefferliste – gegen die echte API geprüft.
 *
 * **Warum das keine Produktvielfalt ist.** Etsy teilt zuerst nach Zielgruppe,
 * dann nach Produkt. Eine Suche nach „T-Shirt" liefert `T-shirts` unter fünf
 * verschiedenen Pfaden und `Sports & Fitness` unter vier – dieselbe Ware,
 * nach Abteilung zerlegt, mit Medianpreisen von 4,25 bis 31,44 USD. Die Zahl
 * der Kategorien als Vielfalt zu lesen zählt dieselben T-Shirts mehrfach.
 * Deshalb geht dieses Signal **in keinen Score-Faktor** ein.
 *
 * **Warum der Schwanz nicht zählt.** Etsys Relevanzsortierung zieht
 * Angrenzendes herein: „Wall Art" liefert `Clocks` (30 %), `Art Objects`
 * (26 %) und `Dollhouse Miniatures` (1 %). Kategorien mit ein bis drei
 * Listings beschreiben die Suche, nicht den Markt – sie fallen unter
 * `MIN_SHARE`/`MIN_LISTINGS` heraus. Was übrig bleibt, ist gemessen: Bei
 * „Enamel Mug" trägt `Mugs` 88 % aus 88 Listings.
 *
 * **Keine Preise je Kategorie.** Wären erhebbar, wären aber nicht belastbar:
 * Die Währungen splittern (bei „Funny Mug" deckt die häufigste 49 von 100
 * Listings), und im Schwanz blieben ein bis zwei verwertbare Preise je
 * Kategorie. Ein Median aus zwei Werten ist kein Median.
 *
 * **Sprache.** Die Namen sind ausschliesslich englisch; `Accept-Language`
 * ändert die Antwort nachweislich nicht. Für einen Etsy-Verkäufer ist das
 * unschädlich – es sind die Bezeichnungen aus dem Kategorie-Auswahlfeld.
 * Damit sie nicht in deutsche Sätze geraten, bleiben sie aus Score-Begründung,
 * Ideentiteln und jedem erzeugten Text heraus.
 *
 * Kontingent: **ein Aufruf**, danach 30 Tage aus dem Cache. Der Baum ändert
 * sich in Wochen, nicht in Stunden.
 */

const ENDPOINT = "https://openapi.etsy.com/v3/application/seller-taxonomy/nodes";

/** Der Baum ist praktisch statisch – ein monatlicher Abgleich genügt. */
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Ein Cache-Schlüssel genügt: Die Antwort hängt von keiner Anfrage ab. */
const CACHE_KEY = "seller-taxonomy";

/** Unterhalb dieses Anteils beschreibt eine Kategorie die Suche, nicht den Markt. */
const MIN_SHARE = 0.05;

/** Und unterhalb dieser Zahl ist der Anteil selbst nicht belastbar. */
const MIN_LISTINGS = 5;

/** Mehr Kategorien erklären nichts mehr – sie füllen nur die Tafel. */
const MAX_CATEGORIES = 6;

// --- Antwortform (nur die gelesenen Felder) --------------------------------

export interface TaxonomyNode {
  id?: number;
  name?: string;
  children?: TaxonomyNode[];
  /** Vollständiger Pfad als ID-Kette, Wurzel zuerst. */
  full_path_taxonomy_ids?: number[];
}

interface TaxonomyResponse {
  results?: TaxonomyNode[];
  error?: string;
  message?: string;
}

/** Blatt-ID auf lesbaren Pfad. */
export type TaxonomyIndex = Map<number, string[]>;

/**
 * Ablageform des Index.
 *
 * Eine `Map` überlebt `JSON.stringify` nicht – sie wird zu `{}`. Der Cache
 * schreibt auf Platte, also reist der Index als Paarliste und wird beim Lesen
 * wieder zur `Map`.
 */
type StoredIndex = [number, string[]][];

let cache: ProviderResponseCache<StoredIndex> | undefined;

function taxonomyCache(): ProviderResponseCache<StoredIndex> {
  const { providers, storage } = getConfig();
  cache ??= new ProviderResponseCache<StoredIndex>({
    namespace: "etsy-taxonomy",
    // Eigene, lange Frist – aber abschaltbar über dieselbe Einstellung wie
    // jeder andere Provider-Cache. Ohne diese Kopplung schriebe ein Testlauf
    // seine Stub-Antwort in die echte Ablage und legte die Einordnung dort
    // für dreissig Tage stumm.
    ttlMs: providers.cacheTtlMs <= 0 ? 0 : TTL_MS,
    dataDir: storage.dataDir,
    // Kein Fehlschlag ist hier stabil: Die Anfrage kennt keinen Suchbegriff,
    // über den sie etwas aussagen könnte. Was scheitert, scheitert am Moment.
  });
  return cache;
}

/** Nur für Tests. */
export function resetTaxonomyCache(): void {
  cache = undefined;
}

/** Holt den Index – beim ersten Mal von Etsy, danach 30 Tage aus dem Cache. */
export async function loadTaxonomy(apiKey: string, signal: AbortSignal): Promise<TaxonomyIndex> {
  const stored = await taxonomyCache().resolve(CACHE_KEY, async () => {
    const response = await fetch(ENDPOINT, {
      signal,
      headers: { accept: "application/json", "x-api-key": apiKey },
    });

    if (!response.ok) {
      throw new ProviderError("etsy", `Taxonomie nicht abrufbar (HTTP ${response.status})`);
    }

    const parsed = (await response.json()) as TaxonomyResponse;
    const failure = parsed.error ?? parsed.message;
    if (failure) throw new ProviderError("etsy", failure);

    return [...indexOf(parsed.results ?? [])];
  });

  return new Map(stored);
}

/** Flacht den Baum zu `id -> Pfadnamen` ab. */
export function indexOf(roots: TaxonomyNode[]): TaxonomyIndex {
  const names = new Map<number, string>();

  (function walk(nodes: TaxonomyNode[]): void {
    for (const node of nodes) {
      if (node.id !== undefined && node.name) names.set(node.id, node.name);
      walk(node.children ?? []);
    }
  })(roots);

  const index: TaxonomyIndex = new Map();

  (function walk(nodes: TaxonomyNode[]): void {
    for (const node of nodes) {
      if (node.id !== undefined) {
        const ids = node.full_path_taxonomy_ids;
        // Ohne Pfadkette bleibt der eigene Name – besser als gar keine
        // Einordnung, und der Blattname ist der Teil, den man liest.
        const path = Array.isArray(ids)
          ? ids.map((id) => names.get(id)).filter((n): n is string => Boolean(n))
          : node.name
            ? [node.name]
            : [];
        if (path.length > 0) index.set(node.id, path);
      }
      walk(node.children ?? []);
    }
  })(roots);

  return index;
}

/**
 * Zählt die Stichprobe nach Kategorie aus.
 *
 * Gruppiert wird über den **Pfad**, nicht den Namen: `Sports & Fitness` unter
 * Adult und unter Kids' sind verschiedene Kategorien mit verschiedenen
 * Preisniveaus. Über den Namen zusammenzufassen verschmölze sie zu einer, die
 * es bei Etsy nicht gibt.
 */
export function buildCategory(
  listings: EtsyListing[],
  taxonomy: TaxonomyIndex,
): MarketCategorySignal | undefined {
  const counts = new Map<string, { path: string[]; listings: number }>();

  for (const listing of listings) {
    const id = listing.taxonomy_id;
    if (id === undefined) continue;
    const path = taxonomy.get(id);
    if (!path || path.length === 0) continue;

    const key = path.join(" > ");
    const entry = counts.get(key) ?? { path, listings: 0 };
    entry.listings += 1;
    counts.set(key, entry);
  }

  if (counts.size === 0) return undefined;

  const sampleSize = listings.length;

  const categories: MarketCategory[] = [...counts.values()]
    .map((entry) => ({
      name: entry.path[entry.path.length - 1] ?? "",
      path: entry.path,
      share: round(entry.listings / sampleSize, 3),
      listings: entry.listings,
    }))
    .filter((c) => c.share >= MIN_SHARE && c.listings >= MIN_LISTINGS)
    .sort((a, b) => b.listings - a.listings)
    .slice(0, MAX_CATEGORIES);

  // Keine belastbare Kategorie heisst: Die Trefferliste zerfällt in lauter
  // Einzelfälle. Das ist eine Aussage über den Begriff, aber keine Einordnung –
  // und eine Einordnung ist das, was dieses Signal verspricht.
  if (categories.length === 0) return undefined;

  return {
    marketplace: "etsy",
    categories,
    distinctCategories: counts.size,
    sampleSize,
  };
}
