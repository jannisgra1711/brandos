import type { DataProvider, DiscoverySeed, ProviderResult } from "../types";
import { createRng, seedKey } from "../util/seeded-random";
import { selectSeeds } from "./discovery-seeds";
import { buildMarketFixture } from "./market-fixture";
import { jitter, maybeFail, simulateLatency } from "./mock-base";

/**
 * Pinterest – visuelle Frühindikatoren.
 *
 * Pinterest zeigt Gestaltungsrichtungen typischerweise ein bis zwei Quartale,
 * bevor sie sich im Marktplatzangebot niederschlagen. Die Quelle ist daher bei
 * Design stark, bei Nachfrage nur ergänzend (niedrigere Priorität).
 */
export const pinterestMockProvider: DataProvider = {
  id: "pinterest",
  label: "Pinterest (Mock)",
  capabilities: ["design", "audience", "keywords", "discovery"],
  kind: "mock",
  priority: 15,
  isAvailable: () => true,

  async fetch(query, context): Promise<ProviderResult> {
    const rng = createRng(seedKey("pinterest", query.term, query.market));
    await simulateLatency(rng, context, "pinterest", 200, 700);
    maybeFail(rng, "pinterest", 0.06, "Authentifizierung abgelaufen");

    const fixture = buildMarketFixture(query, context.now);

    return {
      confidence: 0.74,
      synthetic: true,
      freshnessDays: 4,
      message: "Synthetische Bildsignale – kein Pinterest-Token hinterlegt.",
      payload: {
        design: {
          ...fixture.design,
          observations: [
            ...fixture.design.observations,
            "Visuelle Plattformsignale laufen dem Marktplatzangebot typischerweise ein bis zwei Quartale voraus.",
          ],
        },
        audience: {
          ...fixture.audience,
          // Pinterest überzeichnet Geschenkabsichten systematisch.
          giftPotential: Math.min(100, jitter(rng, fixture.audience.giftPotential, 0.05) + 4),
        },
        keywords: fixture.keywords.filter((k) => k.rising).slice(0, 6),
      },
    };
  },

  async discover(context): Promise<DiscoverySeed[]> {
    const rng = createRng(seedKey("pinterest-discovery", context.now.toISOString().slice(0, 10)));
    await simulateLatency(rng, context, "pinterest", 110, 300);

    return selectSeeds(8, rng.int(0, 40)).map((seed) => ({
      term: seed.term,
      category: seed.category,
      kind: seed.kind === "niche" ? "trend" : seed.kind,
      hint: `Visuell auffällig – ${seed.hint}`,
    }));
  },
};

