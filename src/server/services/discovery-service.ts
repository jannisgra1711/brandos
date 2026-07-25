import "server-only";
import { de, deCompact, dePercent, deShare } from "@/domain/format";
import { monthsUntilNextPeak, scoreOpportunity, toGrade } from "@/domain/scoring";
import type { DiscoveryOpportunity, MarketQuery, OpportunityKind, TrendMover } from "@/domain/types";
import { logger } from "@/server/logging/logger";
import { collectSignals } from "@/server/providers/aggregator";
import { resolveProviders } from "@/server/providers/registry";
import type { DiscoverySeed, ProviderContext } from "@/server/providers/types";
import { TtlCache } from "@/server/util/cache";
import { mapSettled } from "@/server/util/concurrency";

/**
 * Eigenständige Chancensuche.
 *
 * Der Nutzer soll nicht wissen müssen, wonach er suchen soll. Discovery
 * arbeitet deshalb in zwei Stufen:
 *
 *   1. Kandidaten sammeln – Provider schlagen Begriffe vor (`discover()`).
 *   2. Kandidaten sichten – jeder Begriff wird mit einem schlanken
 *      Signalsatz bewertet und begründet.
 *
 * Die zweite Stufe nutzt bewusst nur Nachfrage- und Wettbewerbssignale. Eine
 * vollständige Analyse je Kandidat wäre um ein Vielfaches teurer, ohne die
 * Rangfolge wesentlich zu verändern – die tiefe Auswertung passiert erst,
 * wenn der Nutzer einen Kandidaten öffnet.
 */

const SCAN_CAPABILITIES = ["demand", "competition"] as const;
const SCAN_TIMEOUT_MS = 4000;
const SCAN_CONCURRENCY = 5;

const cache = new TtlCache<DiscoveryOpportunity[]>(15 * 60 * 1000);

export interface DiscoverOptions {
  /** Maximale Anzahl bewerteter Kandidaten. */
  limit?: number;
  now?: Date;
  /** Umgeht den Cache. */
  refresh?: boolean;
}

export async function discoverOpportunities(
  options: DiscoverOptions = {},
): Promise<DiscoveryOpportunity[]> {
  const now = options.now ?? new Date();
  const limit = options.limit ?? 18;
  const key = `${now.toISOString().slice(0, 10)}:${limit}`;

  if (options.refresh) cache.invalidate(key);

  return cache.resolve(key, async () => {
    const log = logger.child("discovery");
    const seeds = await collectSeeds(now);

    log.info("Kandidaten gesammelt", { count: seeds.length });

    const opportunities = await mapSettled(seeds.slice(0, limit), SCAN_CONCURRENCY, (seed) =>
      scanSeed(seed, now),
    );

    const ranked = opportunities
      .filter((o): o is DiscoveryOpportunity => o !== undefined)
      .sort((a, b) => b.score - a.score);

    log.info("Chancen bewertet", { evaluated: ranked.length });
    return ranked;
  });
}

/** Aufsteigende und abflauende Märkte für die Dashboard-Kacheln. */
export async function trendMovers(
  options: DiscoverOptions = {},
): Promise<{ rising: TrendMover[]; saturated: TrendMover[] }> {
  const opportunities = await discoverOpportunities(options);

  const toMover = (o: DiscoveryOpportunity): TrendMover => ({
    term: o.term,
    category: o.category,
    growth90d: o.growth90d,
    demandIndex: o.demandIndex,
    direction: o.direction,
    sparkline: o.sparkline,
  });

  return {
    rising: [...opportunities]
      .filter((o) => o.direction === "rising")
      .sort((a, b) => b.growth90d - a.growth90d)
      .slice(0, 6)
      .map(toMover),
    // Kandidaten ohne Sättigungswert gehören nicht in eine Rangfolge nach
    // Sättigung – sie stünden sonst nur deshalb weit unten, weil niemand
    // gemessen hat.
    saturated: opportunities
      .filter((o) => o.saturationIndex !== undefined)
      .sort((a, b) => (b.saturationIndex ?? 0) - (a.saturationIndex ?? 0))
      .slice(0, 5)
      .map(toMover),
  };
}

// ---------------------------------------------------------------------------

async function collectSeeds(now: Date): Promise<DiscoverySeed[]> {
  const providers = resolveProviders().filter((p) => typeof p.discover === "function");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SCAN_TIMEOUT_MS);

  try {
    const batches = await mapSettled(providers, providers.length, async (provider) => {
      const context: ProviderContext = {
        now,
        logger: logger.child(provider.id),
        signal: controller.signal,
      };
      return (await provider.discover?.(context)) ?? [];
    });

    // Mehrfachnennungen sind ein Signal: ein Begriff, den mehrere Quellen
    // vorschlagen, wird bevorzugt – deshalb wird nach Nennungen sortiert.
    const counts = new Map<string, { seed: DiscoverySeed; mentions: number }>();
    for (const seed of batches.flat()) {
      const key = seed.term.toLowerCase();
      const existing = counts.get(key);
      if (existing) existing.mentions += 1;
      else counts.set(key, { seed, mentions: 1 });
    }

    return [...counts.values()]
      .sort((a, b) => b.mentions - a.mentions)
      .map((e) => e.seed);
  } finally {
    clearTimeout(timer);
  }
}

async function scanSeed(seed: DiscoverySeed, now: Date): Promise<DiscoveryOpportunity | undefined> {
  const query: MarketQuery = { term: seed.term, market: "DE", windowMonths: 18 };

  const signals = await collectSignals(query, {
    now,
    timeoutMs: SCAN_TIMEOUT_MS,
    capabilities: [...SCAN_CAPABILITIES],
  });

  const demand = signals.demand;
  const competition = signals.competition;
  if (!demand) return undefined;

  const score = scoreOpportunity(signals, { now });

  // Die Trendquelle liefert Saisonsignale bereits mit – sie wurden bisher nur
  // nicht bis ins Discovery-Ergebnis durchgereicht.
  const currentMonth = now.getMonth() + 1;
  const seasonality = signals.seasonality
    ? (() => {
        const monthsToPeak = monthsUntilNextPeak(currentMonth, signals.seasonality.peakMonths);
        return {
          peakMonths: signals.seasonality.peakMonths,
          monthsToPeak,
          // Der Peak, auf den der Abstand zeigt – bei mehreren Peaks nicht
          // zwangsläufig der erste in der Liste.
          nextPeakMonth: ((currentMonth - 1 + monthsToPeak) % 12) + 1,
          amplitude: signals.seasonality.amplitude,
        };
      })()
    : undefined;

  return {
    id: slugify(seed.term),
    term: seed.term,
    kind: seed.kind as OpportunityKind,
    category: seed.category,
    score: score.value,
    grade: toGrade(score.value),
    confidence: score.confidence,
    reason: buildReason(seed, demand.growth90d, competition?.saturationIndex),
    evidence: [
      demand.estimatedMonthlySearches === undefined
        ? `Nachfrageindex ${demand.volumeIndex}/100`
        : `Nachfrageindex ${demand.volumeIndex}/100 bei ${deCompact(demand.estimatedMonthlySearches)} Suchen/Monat`,
      `Entwicklung ${dePercent(demand.growth90d)} in 90 Tagen`,
      competition === undefined
        ? "Keine Wettbewerbsdaten verfügbar"
        : competition.saturationIndex === undefined
          ? `${deCompact(competition.listingCount)} Listings im Angebot`
          : `Sättigung ${de(competition.saturationIndex)}/100 bei ${deCompact(competition.listingCount)} Listings`,
    ],
    demandIndex: demand.volumeIndex,
    growth90d: demand.growth90d,
    saturationIndex: competition?.saturationIndex,
    direction: demand.direction,
    sparkline: demand.series.slice(-12).map((p) => p.value),
    seasonality,
  };
}

function buildReason(seed: DiscoverySeed, growth: number, saturation?: number): string {
  const parts = [seed.hint];

  // "fällt um -31 %" wäre doppelt negiert – die Richtung steckt bereits im Verb.
  if (growth > 0.15) parts.push(`Nachfrage wächst um ${deShare(growth * 100, 1)}`);
  else if (growth < -0.12) parts.push(`Nachfrage fällt um ${deShare(Math.abs(growth) * 100, 1)}`);

  if (saturation !== undefined) {
    if (saturation < 55) parts.push("Angebotsseite noch dünn besetzt");
    else if (saturation > 78) parts.push("Angebotsseite bereits dicht");
  }

  return `${parts.join(" – ")}.`;
}

function slugify(term: string): string {
  return term
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => ({ ä: "ae", ö: "oe", ü: "ue", ß: "ss" })[c] ?? c)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}


