import type { DataProvider, ProviderResult } from "../types";
import { createRng, seedKey } from "../util/seeded-random";
import { buildMarketFixture } from "./market-fixture";
import { jitter, maybeFail, simulateLatency } from "./mock-base";

/**
 * Etsy – Angebotsseite.
 *
 * Etsy zeigt, was tatsächlich verkauft wird: Listings, Preise, Produktarten
 * und die visuelle Sprache des Bestandsangebots. Nachfragedaten liefert die
 * Quelle bewusst nicht – dafür sind Trend-Provider zuständig.
 */
export const etsyMockProvider: DataProvider = {
  id: "etsy",
  label: "Etsy (Mock)",
  capabilities: ["competition", "pricing", "products", "design", "keywords"],
  kind: "mock",
  priority: 10,
  isAvailable: () => true,

  async fetch(query, context): Promise<ProviderResult> {
    const rng = createRng(seedKey("etsy", query.term, query.market));
    await simulateLatency(rng, context, "etsy", 180, 620);
    maybeFail(rng, "etsy", 0.04, "Rate Limit erreicht");

    const fixture = buildMarketFixture(query, context.now);

    return {
      confidence: 0.82,
      synthetic: true,
      freshnessDays: 1,
      message: "Synthetischer Marktplatz-Snapshot – kein Etsy-API-Key hinterlegt.",
      payload: {
        competition: {
          ...fixture.competition,
          listingCount: Math.round(jitter(rng, fixture.competition.listingCount, 0.05)),
          activeSellers: Math.round(jitter(rng, fixture.competition.activeSellers, 0.07)),
        },
        pricing: fixture.pricing,
        productTypes: fixture.productTypes,
        design: fixture.design,
        keywords: fixture.keywords.slice(0, 8),
      },
    };
  },
};

