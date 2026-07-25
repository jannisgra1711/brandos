import type { DataProvider, DiscoverySeed, ProviderResult } from "../types";
import { createRng, seedKey } from "../util/seeded-random";
import { selectSeeds } from "./discovery-seeds";
import { buildMarketFixture } from "./market-fixture";
import { maybeFail, simulateLatency } from "./mock-base";

/**
 * Google Trends – Nachfrageseite.
 *
 * Die Leitquelle für Volumen, Verlauf und Saisonalität. Ueber Aussagen zum
 * Wettbewerb schweigt sie – deshalb ist ihre Konfidenz bei Nachfrage hoch,
 * ihre Capabilities aber eng geschnitten.
 */
export const googleTrendsMockProvider: DataProvider = {
  id: "google-trends",
  label: "Google Trends (Mock)",
  capabilities: ["demand", "keywords", "discovery"],
  kind: "mock",
  priority: 20,
  isAvailable: () => true,

  async fetch(query, context): Promise<ProviderResult> {
    const rng = createRng(seedKey("gtrends", query.term, query.market));
    await simulateLatency(rng, context, "google-trends", 220, 780);
    maybeFail(rng, "google-trends", 0.05, "Quelle vorübergehend nicht erreichbar");

    const fixture = buildMarketFixture(query, context.now);

    return {
      confidence: 0.88,
      synthetic: true,
      freshnessDays: 2,
      message: "Synthetische Trendreihe – kein Trends-Zugang konfiguriert.",
      payload: {
        demand: fixture.demand,
        seasonality: fixture.seasonality,
        keywords: fixture.keywords,
      },
    };
  },

  async discover(context): Promise<DiscoverySeed[]> {
    const rng = createRng(seedKey("gtrends-discovery", context.now.toISOString().slice(0, 10)));
    await simulateLatency(rng, context, "google-trends", 120, 340);

    const offset = rng.int(0, 40);
    return selectSeeds(14, offset).map((seed) => ({
      term: seed.term,
      category: seed.category,
      kind: seed.kind,
      hint: seed.hint,
    }));
  },
};

