import "server-only";
import { clamp, mean, round } from "@/domain/math";
import { CAPABILITIES } from "@/domain/types";
import type {
  Capability,
  DataQuality,
  KeywordSignal,
  MarketQuery,
  MarketSignals,
  ProductTypeSignal,
  SourceContribution,
  SourceStatus,
} from "@/domain/types";
import { getConfig } from "@/server/config/env";
import { logger } from "@/server/logging/logger";
import { resolveProviders } from "./registry";
import type { DataProvider, ProviderContext, ProviderPayload, ProviderResult } from "./types";

/**
 * Der Aggregator führt die Provider zusammen.
 *
 * Drei Prinzipien:
 *
 * 1. Teilausfälle sind normal. Fällt eine Quelle aus, entsteht eine Lücke –
 *    kein Fehler. Die Lücke wird in `dataQuality` sichtbar und senkt später
 *    die Konfidenz des Scores.
 * 2. Konflikte werden nach Gewicht (Priorität x Konfidenz) aufgelöst, nicht
 *    nach Zufall oder Reihenfolge.
 * 3. Numerische Signale werden gewichtet gemischt, strukturelle Signale
 *    (Zeitreihen, Kategorien) vom stärksten Beitrag übernommen. Eine
 *    gemittelte Zeitreihe wäre zwar "genauer", aber nicht mehr erklärbar.
 */

interface Contribution {
  provider: DataProvider;
  result: ProviderResult;
  weight: number;
  latencyMs: number;
}

export interface CollectOptions {
  now?: Date;
  /** Ueberschreibt das konfigurierte Provider-Timeout. */
  timeoutMs?: number;
  /** Beschränkt die Sammlung auf Quellen mit diesen Fähigkeiten. */
  capabilities?: Capability[];
  /** Externes Abbruchsignal (z. B. Request-Abbruch durch den Client). */
  signal?: AbortSignal;
  /**
   * Überschreibt die Provider-Auswahl. Ausschließlich für Tests gedacht –
   * die Anwendung fragt immer die Registry, damit es genau einen Ort gibt,
   * an dem Quellen bekannt sind.
   */
  providers?: DataProvider[];
}

export async function collectSignals(
  query: MarketQuery,
  options: CollectOptions = {},
): Promise<MarketSignals> {
  const log = logger.child("aggregator");
  const now = options.now ?? new Date();
  const timeoutMs = options.timeoutMs ?? getConfig().providers.timeoutMs;

  const providers = (options.providers ?? resolveProviders()).filter(
    (p) =>
      !options.capabilities ||
      options.capabilities.some((capability) => p.capabilities.includes(capability)),
  );

  const settled = await Promise.all(
    providers.map((provider) => runProvider(provider, query, now, timeoutMs, options.signal)),
  );

  const contributions: Contribution[] = [];
  const sources: SourceContribution[] = [];

  for (const outcome of settled) {
    sources.push(outcome.contribution);
    if (outcome.result) {
      contributions.push({
        provider: outcome.provider,
        result: outcome.result,
        weight: outcome.provider.priority * outcome.result.confidence,
        latencyMs: outcome.contribution.latencyMs,
      });
    }
  }

  const signals: MarketSignals = {
    query,
    collectedAt: now.toISOString(),
    sources,
    demand: mergeDemand(contributions),
    seasonality: pickBest(contributions, "seasonality"),
    competition: mergeCompetition(contributions),
    pricing: mergePricing(contributions),
    audience: pickBest(contributions, "audience"),
    design: pickBest(contributions, "design"),
    keywords: mergeKeywords(contributions),
    productTypes: mergeProductTypes(contributions),
    dataQuality: assessQuality(sources, contributions),
  };

  log.info("Signale gesammelt", {
    term: query.term,
    ok: sources.filter((s) => s.status === "ok").length,
    failed: sources.filter((s) => s.status !== "ok").length,
    confidence: signals.dataQuality.confidence,
  });

  return signals;
}

// ---------------------------------------------------------------------------
// Provider-Ausführung
// ---------------------------------------------------------------------------

interface ProviderOutcome {
  provider: DataProvider;
  result?: ProviderResult;
  contribution: SourceContribution;
}

async function runProvider(
  provider: DataProvider,
  query: MarketQuery,
  now: Date,
  timeoutMs: number,
  externalSignal?: AbortSignal,
): Promise<ProviderOutcome> {
  const started = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onExternalAbort = () => controller.abort();
  externalSignal?.addEventListener("abort", onExternalAbort, { once: true });

  const context: ProviderContext = {
    now,
    logger: logger.child(provider.id),
    signal: controller.signal,
  };

  const base = {
    source: provider.id,
    label: provider.label,
    capabilities: [...provider.capabilities],
  };

  try {
    const result = await provider.fetch(query, context);
    const latencyMs = Math.round(performance.now() - started);

    return {
      provider,
      result,
      contribution: {
        ...base,
        status: "ok" as SourceStatus,
        synthetic: result.synthetic,
        confidence: round(result.confidence, 2),
        latencyMs,
        freshnessDays: result.freshnessDays,
        message: result.message,
      },
    };
  } catch (error) {
    const latencyMs = Math.round(performance.now() - started);
    const timedOut = controller.signal.aborted;
    const message = error instanceof Error ? error.message : "Unbekannter Fehler";

    logger.child("aggregator").warn("Provider fehlgeschlagen", {
      source: provider.id,
      timedOut,
      message,
    });

    return {
      provider,
      contribution: {
        ...base,
        status: timedOut ? "timeout" : "error",
        synthetic: provider.kind === "mock",
        confidence: 0,
        latencyMs,
        freshnessDays: 0,
        message,
      },
    };
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", onExternalAbort);
  }
}

// ---------------------------------------------------------------------------
// Zusammenführung
// ---------------------------------------------------------------------------

type PayloadKey = keyof ProviderPayload;

function withPayload<K extends PayloadKey>(
  contributions: Contribution[],
  key: K,
): { value: NonNullable<ProviderPayload[K]>; weight: number }[] {
  return contributions
    .filter((c) => c.result.payload[key] !== undefined)
    .map((c) => ({ value: c.result.payload[key] as NonNullable<ProviderPayload[K]>, weight: c.weight }))
    .sort((a, b) => b.weight - a.weight);
}

/** Uebernimmt das Signal des stärksten Beitrags unverändert. */
function pickBest<K extends PayloadKey>(
  contributions: Contribution[],
  key: K,
): NonNullable<ProviderPayload[K]> | undefined {
  return withPayload(contributions, key)[0]?.value;
}

/** Gewichteter Mittelwert über alle Beiträge. */
function blend(entries: { value: number; weight: number }[]): number {
  const totalWeight = entries.reduce((sum, e) => sum + e.weight, 0);
  if (totalWeight <= 0) return entries[0]?.value ?? 0;
  return entries.reduce((sum, e) => sum + e.value * e.weight, 0) / totalWeight;
}

function mergeDemand(contributions: Contribution[]): MarketSignals["demand"] {
  const entries = withPayload(contributions, "demand");
  const primary = entries[0];
  if (!primary) return undefined;

  // Zeitreihe und Volumen kommen von der Leitquelle, damit der Verlauf
  // konsistent bleibt. Nur die Wachstumsraten werden gemischt – dort liefern
  // schnelle Quellen wie TikTok echten Zusatznutzen.
  return {
    ...primary.value,
    growth90d: round(blend(entries.map((e) => ({ value: e.value.growth90d, weight: e.weight }))), 4),
    growth12m: round(blend(entries.map((e) => ({ value: e.value.growth12m, weight: e.weight }))), 4),
  };
}

function mergeCompetition(contributions: Contribution[]): MarketSignals["competition"] {
  const entries = withPayload(contributions, "competition");
  const primary = entries[0];
  if (!primary) return undefined;

  const blendField = (get: (v: (typeof entries)[number]["value"]) => number) =>
    blend(entries.map((e) => ({ value: get(e.value), weight: e.weight })));

  /**
   * Wie `blendField`, aber für Felder, die nicht jede Quelle kennt: gemischt
   * wird nur über die Beiträge, die den Wert tatsächlich liefern. Kennt ihn
   * keine, bleibt das Feld leer – ein Nullwert wäre eine Aussage, und zwar
   * eine falsche.
   */
  const blendOptional = (
    get: (v: (typeof entries)[number]["value"]) => number | undefined,
    decimals: number,
  ): number | undefined => {
    const known = entries
      .map((e) => ({ value: get(e.value), weight: e.weight }))
      .filter((e): e is { value: number; weight: number } => e.value !== undefined);
    if (known.length === 0) return undefined;
    return round(blend(known), decimals);
  };

  return {
    // Listing-Zahlen sind quellenspezifisch (Etsy != Amazon) – hier zählt der
    // Leitmarkt, nicht der Durchschnitt.
    listingCount: primary.value.listingCount,
    // Die erste Quelle, die es überhaupt weiß – gemischt wäre es sinnlos,
    // weil sich Anbieterzahlen zwischen Marktplätzen nicht addieren.
    activeSellers: entries.find((e) => e.value.activeSellers !== undefined)?.value.activeSellers,
    saturationIndex: blendOptional((v) => v.saturationIndex, 1),
    top10SharePct: round(blendField((v) => v.top10SharePct), 1),
    medianListingAgeDays: blendOptional((v) => v.medianListingAgeDays, 0),
    newListings30dPct: blendOptional((v) => v.newListings30dPct, 1),
    entryBarrier: primary.value.entryBarrier,
  };
}

function mergePricing(contributions: Contribution[]): MarketSignals["pricing"] {
  const entries = withPayload(contributions, "pricing");
  const primary = entries[0];
  if (!primary) return undefined;

  const blendField = (get: (v: (typeof entries)[number]["value"]) => number) =>
    round(blend(entries.map((e) => ({ value: get(e.value), weight: e.weight }))), 2);

  return {
    currency: primary.value.currency,
    min: blendField((v) => v.min),
    p25: blendField((v) => v.p25),
    median: blendField((v) => v.median),
    p75: blendField((v) => v.p75),
    max: blendField((v) => v.max),
    // Nur über Quellen mischen, die Listing-Bewertungen tatsächlich kennen.
    // Marktplätze, die stattdessen Verkäuferbewertungen ausweisen, lassen
    // das Feld leer – ihre Größenordnung würde den Mittelwert zerlegen.
    avgReviewsPerListing: (() => {
      const known = entries
        .map((e) => ({ value: e.value.avgReviewsPerListing, weight: e.weight }))
        .filter((e): e is { value: number; weight: number } => e.value !== undefined);
      return known.length === 0 ? undefined : round(blend(known), 1);
    })(),
  };
}

function mergeKeywords(contributions: Contribution[]): KeywordSignal[] {
  const entries = withPayload(contributions, "keywords");
  const merged = new Map<string, { signal: KeywordSignal; weight: number; sources: number }>();

  for (const entry of entries) {
    for (const keyword of entry.value) {
      const key = keyword.term.toLowerCase();
      const existing = merged.get(key);

      if (!existing) {
        merged.set(key, { signal: { ...keyword }, weight: entry.weight, sources: 1 });
        continue;
      }

      // Gewichteter Mittelwert; der Rising-Flag gilt, sobald eine Quelle ihn setzt.
      const total = existing.weight + entry.weight;
      existing.signal = {
        term: existing.signal.term,
        volumeIndex: round(
          (existing.signal.volumeIndex * existing.weight + keyword.volumeIndex * entry.weight) / total,
          1,
        ),
        growth90d: round(
          (existing.signal.growth90d * existing.weight + keyword.growth90d * entry.weight) / total,
          3,
        ),
        competition: round(
          (existing.signal.competition * existing.weight + keyword.competition * entry.weight) / total,
          1,
        ),
        rising: existing.signal.rising || keyword.rising,
      };
      existing.weight = total;
      existing.sources += 1;
    }
  }

  return [...merged.values()]
    // Von mehreren Quellen bestätigte Keywords zuerst, dann nach Volumen.
    .sort((a, b) => b.sources - a.sources || b.signal.volumeIndex - a.signal.volumeIndex)
    .slice(0, 14)
    .map((e) => e.signal);
}

function mergeProductTypes(contributions: Contribution[]): ProductTypeSignal[] {
  const entries = withPayload(contributions, "productTypes");
  const merged = new Map<string, { type: string; share: number; price: number[]; growth: number[] }>();

  for (const entry of entries) {
    for (const productType of entry.value) {
      const key = productType.type.toLowerCase();
      const existing = merged.get(key) ?? {
        type: productType.type,
        share: 0,
        price: [],
        growth: [],
      };
      existing.share += productType.share * entry.weight;
      existing.price.push(productType.medianPrice);
      existing.growth.push(productType.growth90d);
      merged.set(key, existing);
    }
  }

  const total = [...merged.values()].reduce((sum, e) => sum + e.share, 0);
  if (total <= 0) return [];

  return [...merged.values()]
    .map((e) => ({
      type: e.type,
      share: round(e.share / total, 3),
      medianPrice: round(mean(e.price), 2),
      growth90d: round(mean(e.growth), 3),
    }))
    .sort((a, b) => b.share - a.share)
    .slice(0, 8);
}

// ---------------------------------------------------------------------------
// Datenqualität
// ---------------------------------------------------------------------------

function assessQuality(
  sources: SourceContribution[],
  contributions: Contribution[],
): DataQuality {
  const ok = sources.filter((s) => s.status === "ok");

  const covered = new Set<Capability>();
  for (const contribution of contributions) {
    for (const capability of contribution.provider.capabilities) covered.add(capability);
  }

  // "discovery" ist keine Analysefähigkeit und zählt nicht zur Abdeckung.
  const relevant = CAPABILITIES.filter((c) => c !== "discovery");
  const coverage = relevant.filter((c) => covered.has(c)).length / relevant.length;

  const syntheticShare = ok.length === 0 ? 1 : ok.filter((s) => s.synthetic).length / ok.length;
  const freshnessDays = ok.length === 0 ? 0 : round(mean(ok.map((s) => s.freshnessDays)), 1);
  const avgConfidence = ok.length === 0 ? 0 : mean(ok.map((s) => s.confidence));

  // Mehrere unabhängige Quellen erhöhen das Vertrauen deutlich stärker als
  // eine einzelne sehr selbstbewusste Quelle.
  const breadth = clamp(ok.length / 4, 0, 1);
  const confidence = round(
    clamp(
      (avgConfidence * 0.45 + coverage * 0.3 + breadth * 0.25) * (1 - syntheticShare * 0.25),
      0.05,
      1,
    ),
    2,
  );

  return {
    coverage: round(coverage, 2),
    sourceCount: ok.length,
    syntheticShare: round(syntheticShare, 2),
    freshnessDays,
    confidence,
  };
}
