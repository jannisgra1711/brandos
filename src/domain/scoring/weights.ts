import type { ScoreFactorKey } from "@/domain/types";

export type ScoringWeights = Record<ScoreFactorKey, number>;

/**
 * Standardgewichtung des Opportunity Scores.
 *
 * Die Gewichte sind eine Produktentscheidung, keine technische: Nachfrage,
 * Trend und Wettbewerb tragen zusammen über die Hälfte, weil sie die
 * Wirtschaftlichkeit am stärksten bestimmen. Die weichen Faktoren
 * (Geschenkpotenzial, Emotion) sind absichtlich kleiner gewichtet, wirken aber
 * als Differenzierer zwischen sonst gleich bewerteten Märkten.
 *
 * Die Summe muss 1 ergeben – `assertWeights` prüft das beim Import.
 */
export const DEFAULT_WEIGHTS: ScoringWeights = {
  demand: 0.18,
  trend: 0.16,
  competition: 0.18,
  marketAge: 0.08,
  giftPotential: 0.09,
  emotionalPull: 0.09,
  productVariety: 0.07,
  seasonalFit: 0.08,
  priceHeadroom: 0.07,
};

export const FACTOR_LABELS: Record<ScoreFactorKey, string> = {
  demand: "Nachfrage",
  trend: "Trend",
  competition: "Wettbewerb",
  marketAge: "Marktalter",
  giftPotential: "Geschenkpotenzial",
  emotionalPull: "Emotionale Bindung",
  productVariety: "Produktvielfalt",
  seasonalFit: "Saisonales Timing",
  priceHeadroom: "Preisspielraum",
};

/** Kurzbeschreibung je Faktor – wird im UI als Tooltip verwendet. */
export const FACTOR_DESCRIPTIONS: Record<ScoreFactorKey, string> = {
  demand: "Absolutes Nachfragevolumen über alle Quellen.",
  trend: "Richtung und Tempo der Nachfrageentwicklung.",
  competition: "Sättigung, Anbieterkonzentration und Einstiegshürde.",
  marketAge: "Wie jung und damit angreifbar das Bestandsangebot ist.",
  giftPotential: "Eignung für Geschenkkäufe – erhöht Impulsrate und Preis.",
  emotionalPull: "Identifikation der Zielgruppe mit der Nische.",
  productVariety: "Anzahl tragfähiger Produktarten im Markt.",
  seasonalFit: "Passung des heutigen Zeitpunkts zum Saisonverlauf.",
  priceHeadroom: "Spielraum für Premium-Positionierung.",
};

export function normalizeWeights(weights: ScoringWeights): ScoringWeights {
  const total = Object.values(weights).reduce((sum, w) => sum + w, 0);
  if (total <= 0) return DEFAULT_WEIGHTS;
  const entries = Object.entries(weights) as [ScoreFactorKey, number][];
  return Object.fromEntries(entries.map(([key, w]) => [key, w / total])) as ScoringWeights;
}
