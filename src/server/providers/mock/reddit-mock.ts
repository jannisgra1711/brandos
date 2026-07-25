import type { DataProvider, DiscoverySeed, ProviderResult } from "../types";
import { createRng, seedKey } from "../util/seeded-random";
import { selectSeeds } from "./discovery-seeds";
import { buildMarketFixture } from "./market-fixture";
import { maybeFail, simulateLatency } from "./mock-base";

/**
 * Reddit – Sprache und Motive der Community.
 *
 * Die einzige Quelle, die erklärt, *warum* gekauft wird. Sie liefert
 * Zielgruppensegmente und Kaufmotive, aber keine belastbaren Volumina.
 */
export const redditMockProvider: DataProvider = {
  id: "reddit",
  label: "Reddit (Mock)",
  capabilities: ["audience", "keywords", "discovery"],
  kind: "mock",
  priority: 18,
  isAvailable: () => true,

  async fetch(query, context): Promise<ProviderResult> {
    const rng = createRng(seedKey("reddit", query.term, query.market));
    await simulateLatency(rng, context, "reddit", 250, 900);
    maybeFail(rng, "reddit", 0.05, "Zu viele Anfragen");

    const fixture = buildMarketFixture(query, context.now);

    return {
      confidence: 0.71,
      synthetic: true,
      freshnessDays: 3,
      message: "Synthetische Community-Signale – keine Reddit-Credentials hinterlegt.",
      payload: {
        audience: fixture.audience,
        keywords: fixture.keywords
          .filter((k) => k.term !== fixture.term.toLowerCase())
          .slice(0, 5)
          .map((k) => ({ ...k, competition: Math.max(0, k.competition - 8) })),
      },
    };
  },

  async discover(context): Promise<DiscoverySeed[]> {
    const rng = createRng(seedKey("reddit-discovery", context.now.toISOString().slice(0, 10)));
    await simulateLatency(rng, context, "reddit", 140, 380);

    return selectSeeds(6, rng.int(0, 40)).map((seed) => ({
      term: seed.term,
      category: seed.category,
      kind: "unconventional",
      hint: `Wiederkehrendes Thema in Community-Diskussionen – ${seed.hint}`,
    }));
  },
};

