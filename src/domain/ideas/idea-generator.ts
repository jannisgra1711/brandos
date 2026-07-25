import { de } from "@/domain/format";
import { clamp, round } from "@/domain/math";
import type { MarketSignals, OpportunityScore, ProductIdea } from "@/domain/types";

/**
 * Deterministische Ideengenerierung.
 *
 * BrandOS erzeugt Ideen durch *Kombination*, nicht durch Nachbau. Der
 * Generator setzt jede Idee aus sechs Bausteinen zusammen:
 *
 *   Nische x Produktart x Zielgruppe x Emotion x Stil x Alleinstellungsmerkmal
 *
 * Bewusst rein regelbasiert: die Kombinatorik ist nachvollziehbar, testbar und
 * unabhängig von einem Modell verfügbar. Ein Modell kann dieselben Bausteine
 * später kreativer verbinden – die Logik, *welche* Kombinationen überhaupt
 * sinnvoll sind, gehört aber in die Domain.
 */

export interface IdeaOptions {
  count?: number;
}

/** Differenzierungsstrategien, geordnet nach Aufwand. */
const DIFFERENTIATORS = [
  {
    label: "Personalisierung mit Namen oder Daten",
    condition: (s: MarketSignals) => (s.audience?.giftPotential ?? 0) > 60,
    rationale: "Geschenkkäufer zahlen für Personalisierung messbar mehr.",
  },
  {
    label: "Untersegment statt Oberbegriff",
    condition: (s: MarketSignals) => (s.competition?.saturationIndex ?? 0) > 65,
    rationale: "Der Oberbegriff ist besetzt – Spezialisierung umgeht den Wettbewerb.",
  },
  {
    label: "Gegenläufige Designrichtung",
    condition: (s: MarketSignals) => (s.design?.palettes[0]?.share ?? 0) > 0.4,
    rationale: "Eine Farbwelt dominiert – Abweichung erzeugt Aufmerksamkeit im Suchergebnis.",
  },
  {
    label: "Set- oder Bundle-Angebot",
    condition: (s: MarketSignals) => s.productTypes.length >= 4,
    rationale: "Mehrere etablierte Produktarten lassen sich zu höherem Bonwert bündeln.",
  },
  {
    label: "Premium-Materialversion",
    condition: (s: MarketSignals) =>
      (s.pricing?.p75 ?? 0) > (s.pricing?.median ?? 1) * 1.35,
    rationale: "Das obere Preisdrittel ist deutlich abgesetzt – Zahlungsbereitschaft vorhanden.",
  },
  {
    label: "Anlassbezogene Edition",
    condition: (s: MarketSignals) => (s.seasonality?.amplitude ?? 0) > 0.25,
    rationale: "Ausgeprägte Saison – eine Edition zum Peak trifft die Kaufabsicht.",
  },
  {
    label: "Community-Sprache im Wording",
    condition: (s: MarketSignals) => (s.audience?.emotionalIntensity ?? 0) > 70,
    rationale: "Hohe Identifikation – Insider-Wording wirkt stärker als generische Aussagen.",
  },
];

const EMOTION_BY_MOTIVE: Record<string, string> = {
  emotional: "Verbundenheit",
  identity: "Zugehörigkeit",
  social: "Wertschätzung zeigen",
  functional: "Alltagsnutzen",
};

export function generateIdeas(
  signals: MarketSignals,
  score: OpportunityScore,
  options: IdeaOptions = {},
): ProductIdea[] {
  const count = options.count ?? 4;
  const niche = signals.query.term;
  const currency = signals.pricing?.currency ?? "EUR";

  const productTypes = signals.productTypes.length > 0 ? signals.productTypes : fallbackTypes();
  const audiences = signals.audience?.segments ?? [];
  const motives = signals.audience?.motives ?? [];
  const styles = signals.design?.illustrationStyles ?? [];

  const applicable = DIFFERENTIATORS.filter((d) => d.condition(signals));
  const differentiators = applicable.length > 0 ? applicable : DIFFERENTIATORS.slice(0, 2);

  const ideas: ProductIdea[] = [];

  for (let i = 0; i < count; i += 1) {
    const productType = productTypes[i % productTypes.length];
    const audience = audiences[i % Math.max(audiences.length, 1)];
    const motive = motives[i % Math.max(motives.length, 1)];
    const style = styles[i % Math.max(styles.length, 1)];
    const differentiator = differentiators[i % differentiators.length];

    if (!productType || !differentiator) continue;

    const audienceLabel = audience?.label ?? "Enthusiasten der Nische";
    const emotion = motive ? (EMOTION_BY_MOTIVE[motive.kind] ?? motive.label) : "Identifikation";
    // Ohne Design-Signal bleibt der Stil bewusst offen statt erfunden.
    const styleLabel = style?.style ?? "Offen – kein dominanter Stil erkennbar";

    // Das Potenzial einer Einzelidee leitet sich vom Marktscore ab und wird
    // durch die Passung der Bausteine moduliert – nie unabhängig erfunden.
    const typeBonus = productType.growth90d * 40;
    const audienceBonus = (audience?.share ?? 0.25) * 30;
    const motiveBonus = (motive?.weight ?? 0.5) * 12;
    const potential = clamp(score.value + typeBonus + audienceBonus + motiveBonus - 10);

    const distinctiveness = clamp(
      100 - (signals.competition?.saturationIndex ?? 60) + differentiators.length * 4,
    );

    const basePrice = productType.medianPrice > 0 ? productType.medianPrice : (signals.pricing?.median ?? 22);

    ideas.push({
      id: `idea-${i + 1}`,
      title: buildTitle(niche, productType.type, audienceLabel, differentiator.label),
      composition: {
        niche,
        productType: productType.type,
        audience: audienceLabel,
        emotion,
        style: styleLabel,
        differentiator: differentiator.label,
      },
      rationale: `${differentiator.rationale} ${productType.type} ist mit ${de((productType.share ?? 0) * 100)} % Angebotsanteil etabliert, die Zielgruppe "${audienceLabel}" trägt ${de((audience?.share ?? 0.25) * 100)} % der erkennbaren Nachfrage.`,
      potential: round(potential, 1),
      distinctiveness: round(distinctiveness, 1),
      suggestedPriceRange: {
        min: round(basePrice * 0.9, 2),
        max: round(basePrice * 1.6, 2),
        currency,
      },
      risks: buildRisks(signals, differentiator.label),
    });
  }

  return ideas.sort((a, b) => b.potential - a.potential);
}

function buildTitle(
  niche: string,
  productType: string,
  audience: string,
  differentiator: string,
): string {
  const audienceShort = audience.split(/[,(]/)[0]?.trim() ?? audience;
  // Kein toLowerCase: im Deutschen bleiben Substantive großgeschrieben.
  return `${niche}-${productType} für ${audienceShort}: ${differentiator}`;
}

function buildRisks(signals: MarketSignals, differentiator: string): string[] {
  const risks: string[] = [];

  const saturation = signals.competition?.saturationIndex ?? 0;
  if (saturation > 75) {
    risks.push(`Hohe Sättigung (${de(saturation)}/100) – Sichtbarkeit erfordert klare Differenzierung.`);
  }
  if ((signals.seasonality?.amplitude ?? 0) > 0.4) {
    risks.push("Stark saisonaler Markt – außerhalb des Peaks bricht die Nachfrage ein.");
  }
  if (differentiator.startsWith("Personalisierung")) {
    risks.push("Personalisierung erhöht den Produktionsaufwand je Bestellung.");
  }
  if (signals.dataQuality.confidence < 0.5) {
    risks.push("Dünne Datengrundlage – vor Investition mit echten Quellen validieren.");
  }
  if (risks.length === 0) {
    risks.push("Keine ausgeprägten Risiken erkennbar – Umsetzungsqualität entscheidet.");
  }

  return risks;
}

function fallbackTypes() {
  return [
    { type: "T-Shirt", share: 0.3, medianPrice: 24, growth90d: 0.03 },
    { type: "Tasse", share: 0.25, medianPrice: 18, growth90d: 0.02 },
    { type: "Poster", share: 0.25, medianPrice: 21, growth90d: 0.04 },
    { type: "Sticker", share: 0.2, medianPrice: 6, growth90d: 0.05 },
  ];
}
