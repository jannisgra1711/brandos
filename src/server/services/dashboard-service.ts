import "server-only";
import { mean, round } from "@/domain/math";
import type { DashboardOverview, DiscoveryOpportunity } from "@/domain/types";
import { dataMode } from "@/server/providers/registry";
import { getAnalysisRepository } from "@/server/repositories";
import { discoverOpportunities, trendMovers } from "./discovery-service";

/**
 * Zusammenstellung des Dashboards.
 *
 * Leitgedanke: Ein leeres Dashboard ist ein Produktfehler. Selbst beim ersten
 * Oeffnen – ohne jede gespeicherte Analyse – muss der Nutzer verwertbare
 * Inhalte sehen. Deshalb speist sich das Dashboard primär aus Discovery und
 * nur ergänzend aus der eigenen Historie.
 */
export async function buildDashboard(options: { now?: Date } = {}): Promise<DashboardOverview> {
  const now = options.now ?? new Date();
  const repository = getAnalysisRepository();

  const [opportunities, movers, recentAnalyses, savedAnalyses, analysesRun] = await Promise.all([
    discoverOpportunities({ now }),
    trendMovers({ now }),
    repository.list({ limit: 6 }),
    repository.list({ limit: 6, savedOnly: true }),
    repository.count(),
  ]);

  const currentMonth = now.getMonth() + 1;

  return {
    generatedAt: now.toISOString(),
    stats: {
      trackedNiches: opportunities.length,
      risingMarkets: opportunities.filter((o) => o.direction === "rising").length,
      avgOpportunityScore: round(mean(opportunities.map((o) => o.score)), 1),
      analysesRun,
    },
    topOpportunities: opportunities.slice(0, 6),
    risingTrends: movers.rising,
    seasonalWindows: selectSeasonalWindows(opportunities, currentMonth),
    saturatedMarkets: movers.saturated,
    recentAnalyses,
    savedAnalyses,
    dataMode: dataMode(),
  };
}

/**
 * Saisonale Fenster: Kandidaten, deren Anlass in Reichweite liegt.
 *
 * Ohne echte Saisondaten je Kandidat wird die Einstufung des Providers
 * ("seasonal") genutzt und nach Score gereiht. Sobald der Scan auch
 * Saisonsignale mitliefert, ersetzt der reale Peak-Abstand diese Näherung.
 */
function selectSeasonalWindows(
  opportunities: DiscoveryOpportunity[],
  _currentMonth: number,
): DiscoveryOpportunity[] {
  const seasonal = opportunities.filter((o) => o.kind === "seasonal");
  const pool = seasonal.length >= 3 ? seasonal : opportunities.filter((o) => o.kind !== "evergreen");
  return pool.slice(0, 4);
}
