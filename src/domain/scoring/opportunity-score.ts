import { de, deCompact, deMonth, dePercent, deShare } from "@/domain/format";
import {
  clamp,
  normalize,
  normalizeInverse,
  normalizeLog,
  normalizedEntropy,
  round,
} from "@/domain/math";
import type {
  MarketSignals,
  OpportunityGrade,
  OpportunityScore,
  ScoreFactor,
  ScoreFactorKey,
  TrendDirection,
} from "@/domain/types";
import { DEFAULT_WEIGHTS, FACTOR_LABELS, normalizeWeights, type ScoringWeights } from "./weights";

/**
 * Der Opportunity Score ist bewusst eine reine Funktion ohne AI-Beteiligung.
 *
 * Begründung: Eine Zahl, die über Investitionsentscheidungen mitbestimmt,
 * muss reproduzierbar, testbar und erklärbar sein. Das Modell interpretiert
 * den Score später – es berechnet ihn nicht.
 *
 * Fehlt ein Signal, wird der Faktor mit einem neutralen Wert (50) belegt und
 * als `imputed` markiert. Das senkt die Konfidenz, nicht den Score – ein
 * fehlender Wert ist keine schlechte Nachricht, sondern eine Unsicherheit.
 */

const NEUTRAL = 50;

export interface ScoreOptions {
  weights?: ScoringWeights;
  /** Referenzzeitpunkt für die Saisonbewertung (Testbarkeit). */
  now?: Date;
}

type FactorResult = { value: number; rationale: string; imputed?: boolean };

export function scoreOpportunity(
  signals: MarketSignals,
  options: ScoreOptions = {},
): OpportunityScore {
  const weights = normalizeWeights(options.weights ?? DEFAULT_WEIGHTS);
  const now = options.now ?? new Date();

  const results: Record<ScoreFactorKey, FactorResult> = {
    demand: scoreDemand(signals),
    trend: scoreTrend(signals),
    competition: scoreCompetition(signals),
    marketAge: scoreMarketAge(signals),
    giftPotential: scoreGiftPotential(signals),
    emotionalPull: scoreEmotionalPull(signals),
    productVariety: scoreProductVariety(signals),
    seasonalFit: scoreSeasonalFit(signals, now),
    priceHeadroom: scorePriceHeadroom(signals),
  };

  const factors: ScoreFactor[] = (Object.keys(results) as ScoreFactorKey[]).map((key) => {
    const result = results[key];
    return {
      key,
      label: FACTOR_LABELS[key],
      value: round(clamp(result.value), 1),
      weight: round(weights[key], 4),
      rationale: result.rationale,
      imputed: result.imputed ?? false,
    };
  });

  const weighted = factors.reduce((sum, f) => sum + f.value * f.weight, 0);
  const value = round(clamp(weighted), 1);

  const imputedWeight = factors
    .filter((f) => f.imputed)
    .reduce((sum, f) => sum + f.weight, 0);
  const confidence = round(
    clamp(signals.dataQuality.confidence * (1 - imputedWeight * 0.6), 0.05, 1),
    2,
  );

  const ranked = [...factors].sort(
    (a, b) => (b.value - NEUTRAL) * b.weight - (a.value - NEUTRAL) * a.weight,
  );

  return {
    value,
    grade: toGrade(value),
    confidence,
    factors,
    drivers: ranked
      .filter((f) => f.value > 58 && !f.imputed)
      .slice(0, 3)
      .map((f) => `${f.label}: ${f.rationale}`),
    drags: ranked
      .reverse()
      .filter((f) => f.value < 45 && !f.imputed)
      .slice(0, 3)
      .map((f) => `${f.label}: ${f.rationale}`),
  };
}

export function toGrade(value: number): OpportunityGrade {
  if (value >= 75) return "A";
  if (value >= 60) return "B";
  if (value >= 45) return "C";
  return "D";
}

// ---------------------------------------------------------------------------
// Einzelfaktoren
// ---------------------------------------------------------------------------

function missing(label: string): FactorResult {
  return {
    value: NEUTRAL,
    imputed: true,
    rationale: `Keine belastbaren Daten zu ${label} – neutral bewertet.`,
  };
}

function scoreDemand(signals: MarketSignals): FactorResult {
  const demand = signals.demand;
  if (!demand) return missing("Nachfrage");

  // Zwei Perspektiven: relative Position im Markt und absolutes Volumen.
  const relative = clamp(demand.volumeIndex);

  // Ohne Absolutvolumen bleibt der relative Index die einzige gemessene
  // Größe – dann trägt er den Faktor allein. Der Faktor gilt trotzdem nicht
  // als geschätzt: er beruht auf echten Daten, nur auf weniger davon.
  if (demand.estimatedMonthlySearches === undefined) {
    return {
      value: relative,
      rationale: `Nachfrageindex ${de(relative)}/100; kein absolutes Suchvolumen verfügbar.`,
    };
  }

  const absolute = normalizeLog(demand.estimatedMonthlySearches, 500, 400_000);
  const value = relative * 0.55 + absolute * 0.45;

  return {
    value,
    rationale: `${deCompact(demand.estimatedMonthlySearches)} Suchanfragen/Monat, Nachfrageindex ${de(relative)}/100.`,
  };
}

function scoreTrend(signals: MarketSignals): FactorResult {
  const demand = signals.demand;
  if (!demand) return missing("Trendentwicklung");

  // Kurzfrist zählt mehr als Langfrist – aber ein 12-Monats-Abwärtstrend
  // soll ein kurzfristiges Strohfeuer nicht überdecken.
  const short = normalize(demand.growth90d, -0.35, 0.9);
  const long = normalize(demand.growth12m, -0.4, 1.2);
  let value = short * 0.6 + long * 0.4;

  if (demand.direction === "volatile") value -= 8;

  return {
    value,
    rationale: `${dePercent(demand.growth90d)} in 90 Tagen, ${dePercent(demand.growth12m)} im Jahresvergleich (${DIRECTION_LABEL[demand.direction]}).`,
  };
}

function scoreCompetition(signals: MarketSignals): FactorResult {
  const competition = signals.competition;
  if (!competition) return missing("Wettbewerb");

  // Meldet die Quelle keinen Sättigungsindex, wird er aus der Zahl der
  // Listings abgeleitet. Die Normierung gehört ohnehin hierher und nicht in
  // den Provider: eine Suchergebnisliste kennt ihre Treffer, aber nicht das
  // Verhältnis zur Nachfrage.
  const derived = competition.saturationIndex === undefined;
  const saturationIndex = competition.saturationIndex ?? normalizeLog(competition.listingCount, 200, 200_000);

  const saturation = normalizeInverse(saturationIndex, 10, 95);
  // Hohe Konzentration bei den Top 10 bedeutet: der Markt ist verteilt.
  const concentration = normalizeInverse(competition.top10SharePct, 8, 60);
  const barrierPenalty = { low: 0, medium: 6, high: 14 }[competition.entryBarrier];

  const value = saturation * 0.65 + concentration * 0.35 - barrierPenalty;

  const basis = derived ? " (aus der Listing-Zahl abgeleitet)" : "";

  return {
    value,
    rationale: `Sättigung ${de(saturationIndex)}/100${basis} bei ${deCompact(competition.listingCount)} Listings, Top-10-Anteil ${deShare(competition.top10SharePct)}.`,
  };
}

function scoreMarketAge(signals: MarketSignals): FactorResult {
  const competition = signals.competition;
  if (!competition) return missing("Marktalter");

  // Alter und Zustrom stehen in keiner Suchergebnisliste. Ohne sie lässt
  // sich über die Angreifbarkeit des Bestandsangebots nichts sagen –
  // neutral bewerten ist ehrlicher als aus dem Rest zu raten.
  const { medianListingAgeDays, newListings30dPct } = competition;
  if (medianListingAgeDays === undefined || newListings30dPct === undefined) {
    return missing("Marktalter");
  }

  // Junges Bestandsangebot ist leichter angreifbar ...
  const youth = normalizeInverse(medianListingAgeDays, 90, 1460);
  // ... ein zu starker Zustrom neuer Anbieter deutet aber auf einen
  // überhitzten Markt hin, in dem die Marge schnell wegbricht.
  const overheating =
    newListings30dPct > 22 ? normalize(newListings30dPct - 22, 0, 30) * 0.5 : 0;

  return {
    value: youth - overheating,
    rationale: `Medianalter der Listings ${de(medianListingAgeDays)} Tage, ${deShare(newListings30dPct, 1)} Neuzugänge in 30 Tagen.`,
  };
}

function scoreGiftPotential(signals: MarketSignals): FactorResult {
  const audience = signals.audience;
  if (!audience) return missing("Geschenkpotenzial");
  return {
    value: clamp(audience.giftPotential),
    rationale: `Geschenkeignung ${de(audience.giftPotential)}/100 – ${describeGift(audience.giftPotential)}.`,
  };
}

function scoreEmotionalPull(signals: MarketSignals): FactorResult {
  const audience = signals.audience;
  if (!audience) return missing("Kaufmotive");

  const emotionalShare = audience.motives.length
    ? audience.motives
        .filter((m) => m.kind === "emotional" || m.kind === "identity")
        .reduce((sum, m) => sum + m.weight, 0) /
      audience.motives.reduce((sum, m) => sum + m.weight, 0)
    : 0.5;

  const value = clamp(audience.emotionalIntensity) * 0.6 + emotionalShare * 100 * 0.4;
  const top = audience.motives[0]?.label ?? "unklar";

  return {
    value,
    rationale: `Stärkstes Motiv "${top}", emotionaler Anteil ${deShare(emotionalShare * 100)}.`,
  };
}

function scoreProductVariety(signals: MarketSignals): FactorResult {
  const types = signals.productTypes;
  if (types.length === 0) return missing("Produktarten");

  const breadth = normalize(types.length, 2, 12);
  const spread = normalizedEntropy(types.map((t) => t.share)) * 100;
  const value = breadth * 0.5 + spread * 0.5;

  return {
    value,
    rationale: `${types.length} tragfähige Produktarten, führend "${types[0]?.type}" mit ${deShare((types[0]?.share ?? 0) * 100)}.`,
  };
}

function scoreSeasonalFit(signals: MarketSignals, now: Date): FactorResult {
  const seasonality = signals.seasonality;
  if (!seasonality) return missing("Saisonalität");

  // Flache Kurve = ganzjähriger Markt. Kein Timing-Risiko, kein Timing-Bonus.
  if (seasonality.amplitude < 0.15) {
    return {
      value: 62,
      rationale: "Ganzjährig stabile Nachfrage – kein Timing-Risiko.",
    };
  }

  const currentMonth = now.getMonth() + 1;
  const lead = monthsUntilNextPeak(currentMonth, seasonality.peakMonths);

  // Das ideale Fenster liegt 2–4 Monate vor dem Peak: genug Zeit für
  // Produktion, Listing-Reifung und organisches Ranking.
  const timing =
    lead >= 2 && lead <= 4
      ? 95
      : lead === 1
        ? 70
        : lead === 5
          ? 72
          : lead === 0
            ? 45
            : normalizeInverse(lead, 5, 11) * 0.7 + 25;

  const value = timing * (0.7 + seasonality.amplitude * 0.3);
  const peakLabel = seasonality.peakMonths.map(deMonth).join(", ");

  return {
    value,
    rationale: `Peak in ${peakLabel} (${lead} Monate entfernt), Saisonamplitude ${deShare(seasonality.amplitude * 100)}.`,
  };
}

function scorePriceHeadroom(signals: MarketSignals): FactorResult {
  const pricing = signals.pricing;
  if (!pricing || pricing.median <= 0) return missing("Preisniveau");

  // Ein breites Preisband zeigt, dass der Markt Premium akzeptiert.
  const spread = (pricing.p75 - pricing.p25) / pricing.median;
  const spreadScore = normalize(spread, 0.15, 1.4);
  const levelScore = normalizeLog(pricing.median, 8, 120);
  const value = spreadScore * 0.55 + levelScore * 0.45;

  return {
    value,
    rationale: `Median ${de(pricing.median, 2)} ${pricing.currency}, Preisband ${de(pricing.p25)}–${de(pricing.p75)} ${pricing.currency}.`,
  };
}

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

/** Abstand in Monaten bis zum nächsten Peak-Monat (0 = Peak läuft gerade). */
export function monthsUntilNextPeak(currentMonth: number, peakMonths: readonly number[]): number {
  if (peakMonths.length === 0) return 6;
  const distances = peakMonths.map((peak) => (peak - currentMonth + 12) % 12);
  return Math.min(...distances);
}

/** Die interne Trendkennung darf nicht in nutzersichtbaren Text durchschlagen. */
const DIRECTION_LABEL: Record<TrendDirection, string> = {
  rising: "steigend",
  stable: "stabil",
  declining: "fallend",
  volatile: "schwankend",
};

function describeGift(value: number): string {
  if (value >= 75) return "starker Geschenkmarkt";
  if (value >= 55) return "teilweise Geschenkkäufe";
  return "überwiegend Eigenbedarf";
}
