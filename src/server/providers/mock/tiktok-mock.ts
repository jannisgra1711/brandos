import { round } from "@/domain/math";
import type { DataProvider, ProviderResult } from "../types";
import { createRng, seedKey } from "../util/seeded-random";
import { buildMarketFixture } from "./market-fixture";
import { maybeFail, simulateLatency } from "./mock-base";

/**
 * TikTok – kurzfristige Aufmerksamkeit.
 *
 * Die Quelle reagiert am schnellsten, ist aber auch am unzuverlässigsten:
 * ein viraler Peak bedeutet nicht zwingend Kaufabsicht. Sie liefert deshalb
 * nur eine Nachfrageperspektive mit niedriger Priorität und niedriger
 * Konfidenz – sie darf Google Trends nicht überstimmen.
 */
export const tiktokMockProvider: DataProvider = {
  id: "tiktok",
  label: "TikTok (Mock)",
  capabilities: ["demand", "keywords"],
  kind: "mock",
  priority: 6,
  isAvailable: () => true,

  async fetch(query, context): Promise<ProviderResult> {
    const rng = createRng(seedKey("tiktok", query.term, query.market));
    await simulateLatency(rng, context, "tiktok", 260, 950);
    maybeFail(rng, "tiktok", 0.08, "Feed-Endpoint nicht verfügbar");

    const fixture = buildMarketFixture(query, context.now);
    const hype = rng.range(0.9, 2.1);

    return {
      confidence: 0.52,
      synthetic: true,
      freshnessDays: 0,
      message: "Synthetische Aufmerksamkeitsdaten – Kurzfristsignal, keine Kaufabsicht.",
      payload: {
        demand: {
          ...fixture.demand,
          growth90d: round(fixture.demand.growth90d * hype, 4),
          direction: hype > 1.6 ? "volatile" : fixture.demand.direction,
        },
        keywords: fixture.keywords
          .filter((k) => k.rising)
          .slice(0, 4)
          .map((k) => ({ ...k, growth90d: round(k.growth90d * hype, 3) })),
      },
    };
  },
};

