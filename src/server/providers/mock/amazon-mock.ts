import { round } from "@/domain/math";
import type { DataProvider, ProviderResult } from "../types";
import { createRng, seedKey } from "../util/seeded-random";
import { buildMarketFixture } from "./market-fixture";
import { jitter, maybeFail, simulateLatency } from "./mock-base";

/**
 * Amazon – Preisanker und Massenmarkt.
 *
 * Amazon setzt die Preiserwartung der Käufer, liegt aber systematisch unter
 * dem Etsy-Niveau. Der Aggregator gewichtet die Quelle bei Preisen daher
 * niedriger als den handgemachten Marktplatz – sie korrigiert nach unten,
 * dominiert aber nicht.
 *
 * **Ohne `products`, seit die Taxonomie gemessen ist.** Diese Quelle war der
 * letzte Träger von `productTypes` und damit der Grund, warum „Produktvielfalt"
 * mit 7 % der Gewichtung auf einer erfundenen Zahl stand. Die Messung an Etsys
 * Taxonomie hat gezeigt, dass eine Marktplatz-Kategorisierung *keine*
 * Produktvielfalt misst (siehe `etsy-taxonomy.ts`) – ein Ersatz existiert
 * also nicht. Der Faktor wird seitdem als `imputed` geführt: Er senkt die
 * Konfidenz, statt einen Wert vorzutäuschen. Eine Lücke, die man sieht, ist
 * besser als eine Zahl, die man glaubt.
 */
export const amazonMockProvider: DataProvider = {
  id: "amazon",
  label: "Amazon (Mock)",
  capabilities: ["competition", "pricing"],
  kind: "mock",
  priority: 8,
  isAvailable: () => true,

  async fetch(query, context): Promise<ProviderResult> {
    const rng = createRng(seedKey("amazon", query.term, query.market));
    await simulateLatency(rng, context, "amazon", 300, 1100);
    maybeFail(rng, "amazon", 0.07, "Antwort unvollständig");

    const fixture = buildMarketFixture(query, context.now);
    const priceFactor = rng.range(0.72, 0.9);

    return {
      confidence: 0.68,
      synthetic: true,
      freshnessDays: 2,
      message: "Synthetischer Preisanker – kein Amazon-Zugang konfiguriert.",
      payload: {
        pricing: {
          ...fixture.pricing,
          min: round(fixture.pricing.min * priceFactor, 2),
          p25: round(fixture.pricing.p25 * priceFactor, 2),
          median: round(fixture.pricing.median * priceFactor, 2),
          p75: round(fixture.pricing.p75 * priceFactor, 2),
          max: round(fixture.pricing.max * priceFactor, 2),
          avgReviewsPerListing: round(jitter(rng, fixture.pricing.avgReviewsPerListing * 3.4, 0.2), 1),
        },
        competition: {
          ...fixture.competition,
          // Der Massenmarkt ist dichter besetzt und stärker konzentriert.
          listingCount: Math.round(fixture.competition.listingCount * rng.range(1.4, 2.8)),
          saturationIndex: Math.min(96, round(fixture.competition.saturationIndex + rng.range(3, 11), 1)),
          top10SharePct: Math.min(70, round(fixture.competition.top10SharePct + rng.range(4, 12), 1)),
          entryBarrier: "high",
        },
      },
    };
  },
};

