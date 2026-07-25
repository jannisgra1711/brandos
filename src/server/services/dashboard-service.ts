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
    seasonalWindows: selectSeasonalWindows(opportunities),
    saturatedMarkets: movers.saturated,
    recentAnalyses,
    savedAnalyses,
    dataMode: dataMode(),
  };
}

/**
 * Saisonale Fenster: Kandidaten, deren Anlass in Reichweite liegt.
 *
 * Maßgeblich ist der reale Abstand zum nächsten Peak, nicht die Einstufung
 * der Quelle. Das ideale Fenster liegt zwei bis vier Monate davor – genug Zeit
 * für Produktion, Listing-Reifung und organisches Ranking.
 *
 * Märkte ohne ausgeprägte Saison (Amplitude unter 15 %) gehören nicht hierher:
 * Bei ihnen gibt es kein Zeitfenster, das man verpassen könnte.
 */
const IDEAL_LEAD_MONTHS = { min: 1, max: 5 } as const;
const MIN_AMPLITUDE = 0.15;

function selectSeasonalWindows(opportunities: DiscoveryOpportunity[]): DiscoveryOpportunity[] {
  return opportunities
    .filter((o) => {
      const season = o.seasonality;
      if (!season || season.amplitude < MIN_AMPLITUDE) return false;
      return (
        season.monthsToPeak >= IDEAL_LEAD_MONTHS.min && season.monthsToPeak <= IDEAL_LEAD_MONTHS.max
      );
    })
    // Der dringlichere Anlass zuerst; bei gleichem Abstand der bessere Score.
    .sort(
      (a, b) =>
        (a.seasonality?.monthsToPeak ?? 99) - (b.seasonality?.monthsToPeak ?? 99) ||
        b.score - a.score,
    )
    .slice(0, 4);
}
