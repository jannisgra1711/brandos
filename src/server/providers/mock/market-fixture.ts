import { clamp, mean, normalizeLog, pctChange, round } from "@/domain/math";
import type {
  AudienceSignal,
  CompetitionSignal,
  DemandSignal,
  DesignSignal,
  KeywordSignal,
  MarketQuery,
  PricingSignal,
  ProductTypeSignal,
  SeasonalitySignal,
  TimePoint,
  TrendDirection,
} from "@/domain/types";
import { createRng, seedKey, type Rng } from "../util/seeded-random";
import {
  GENERIC,
  ILLUSTRATION_STYLES,
  TYPOGRAPHY_STYLES,
  matchNiche,
  type NicheProfile,
} from "./lexicon";

/**
 * Das Markt-Fixture ist die gemeinsame "Wahrheit" hinter allen Mock-Providern.
 *
 * Warum zentral und nicht pro Provider? Weil ein Markt, in dem Etsy 40.000
 * Listings meldet und Google Trends gleichzeitig ein Nischenvolumen von 300
 * Suchen zeigt, unglaubwürdig ist. Die Provider projizieren jeweils nur ihren
 * Ausschnitt dieses Fixtures und verrauschen ihn leicht – so bleiben sie
 * technisch unabhängig, ohne sich fachlich zu widersprechen.
 */

export interface MarketFixture {
  term: string;
  category: string;
  profileKey: string;
  demand: DemandSignal;
  seasonality: SeasonalitySignal;
  competition: CompetitionSignal;
  pricing: PricingSignal;
  audience: AudienceSignal;
  design: DesignSignal;
  keywords: KeywordSignal[];
  productTypes: ProductTypeSignal[];
}

const cache = new Map<string, MarketFixture>();

export function buildMarketFixture(query: MarketQuery, now: Date = new Date()): MarketFixture {
  const key = seedKey(
    query.term,
    query.category,
    query.market,
    `${now.getUTCFullYear()}-${now.getUTCMonth()}`,
  );
  const cached = cache.get(key);
  if (cached) return cached;

  const fixture = createFixture(query, now, createRng(key));
  cache.set(key, fixture);
  return fixture;
}

/** Nur für Tests / Cache-Invalidierung im Dev-Modus. */
export function clearFixtureCache(): void {
  cache.clear();
}

// ---------------------------------------------------------------------------

function createFixture(query: MarketQuery, now: Date, rng: Rng): MarketFixture {
  const term = query.term.trim();
  const profile = matchNiche(term);
  const windowMonths = query.windowMonths ?? 24;

  const seasonality = buildSeasonality(profile, rng);
  const demand = buildDemand(profile, seasonality, windowMonths, now, rng);
  const competition = buildCompetition(profile, demand, rng);
  const pricing = buildPricing(profile, rng);
  const audience = buildAudience(profile, rng);
  const design = buildDesign(profile, rng);
  const productTypes = buildProductTypes(profile, pricing, rng);
  const keywords = buildKeywords(term, profile, demand, competition, rng);

  return {
    term,
    category: profile?.category ?? inferCategory(term, rng),
    profileKey: profile?.key ?? "generic",
    demand,
    seasonality,
    competition,
    pricing,
    audience,
    design,
    keywords,
    productTypes,
  };
}

// --- Saisonalität ---------------------------------------------------------

function buildSeasonality(profile: NicheProfile | undefined, rng: Rng): SeasonalitySignal {
  const peakMonths = profile?.peakMonths ?? rng.pickMany([1, 3, 4, 5, 9, 11, 12], rng.int(1, 2));
  const amplitude = clamp(rng.gaussian(profile ? 0.34 : 0.26, 0.12), 0.05, 0.75);

  // Jeder Peak-Monat erzeugt eine Glockenkurve; überlappende Peaks addieren
  // sich, was z. B. das Q4-Plateau im Geschenkmarkt realistisch abbildet.
  const raw = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    const bump = peakMonths.reduce((sum, peak) => {
      const distance = Math.min(Math.abs(month - peak), 12 - Math.abs(month - peak));
      return sum + Math.exp(-(distance ** 2) / 2.2);
    }, 0);
    return 1 + bump * amplitude * 1.6;
  });

  const average = mean(raw);
  const monthlyIndex = raw.map((v) => round(v / average, 3));

  const sorted = monthlyIndex
    .map((value, index) => ({ month: index + 1, value }))
    .sort((a, b) => b.value - a.value);

  return {
    amplitude: round(amplitude, 3),
    monthlyIndex,
    peakMonths: [...peakMonths].sort((a, b) => a - b),
    lowMonths: sorted
      .slice(-2)
      .map((e) => e.month)
      .sort((a, b) => a - b),
    drivers: profile?.seasonDrivers ?? ["Allgemeine Geschenksaison"],
  };
}

// --- Nachfrage -------------------------------------------------------------

/**
 * Im synthetischen Markt ist das Absolutvolumen immer bekannt – es ist ja
 * erfunden. Echte Quellen wie Google Trends kennen es nicht, deshalb ist das
 * Feld im Domänentyp optional. Diese Verschärfung hält die Invariante des
 * Fixtures fest, ohne sie mit einer Nicht-null-Assertion zu behaupten.
 */
type MockDemand = DemandSignal & { estimatedMonthlySearches: number };

function buildDemand(
  profile: NicheProfile | undefined,
  seasonality: SeasonalitySignal,
  windowMonths: number,
  now: Date,
  rng: Rng,
): MockDemand {
  // Log-uniforme Basis: die meisten Nischen sind klein, wenige sehr groß.
  const magnitude = rng.range(2.9, profile ? 5.3 : 4.9);
  const base = 10 ** magnitude;

  const annualGrowth = clamp(rng.gaussian(0.1, 0.34), -0.45, 1.15);
  const volatility = clamp(rng.gaussian(0.07, 0.04), 0.02, 0.22);

  const months = Math.max(14, Math.min(windowMonths, 36));
  const series: TimePoint[] = [];

  for (let i = months - 1; i >= 0; i -= 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const monthIndex = date.getUTCMonth();
    const yearsFromNow = -i / 12;

    const trendFactor = (1 + annualGrowth) ** yearsFromNow;
    const seasonFactor = seasonality.monthlyIndex[monthIndex] ?? 1;
    const noise = rng.gaussian(1, volatility);

    series.push({
      period: `${date.getUTCFullYear()}-${String(monthIndex + 1).padStart(2, "0")}`,
      value: Math.max(1, Math.round(base * trendFactor * seasonFactor * noise)),
    });
  }

  const values = series.map((p) => p.value);
  const last3 = mean(values.slice(-3));
  const prev3 = mean(values.slice(-6, -3));
  const last12 = mean(values.slice(-12));
  const prev12 = values.length >= 24 ? mean(values.slice(-24, -12)) : last12 / (1 + annualGrowth);

  const growth90d = round(pctChange(prev3, last3), 4);
  const growth12m = round(pctChange(prev12, last12), 4);

  return {
    volumeIndex: round(normalizeLog(base, 500, 300_000), 1),
    estimatedMonthlySearches: Math.round(last3),
    growth90d,
    growth12m,
    direction: deriveDirection(growth90d, growth12m, volatility),
    series,
  };
}

function deriveDirection(
  growth90d: number,
  growth12m: number,
  volatility: number,
): TrendDirection {
  if (volatility > 0.15 && Math.sign(growth90d) !== Math.sign(growth12m)) return "volatile";
  const blended = growth90d * 0.6 + growth12m * 0.4;
  if (blended > 0.12) return "rising";
  if (blended < -0.1) return "declining";
  return "stable";
}

// --- Wettbewerb ------------------------------------------------------------

function buildCompetition(
  profile: NicheProfile | undefined,
  demand: MockDemand,
  rng: Rng,
): CompetitionSignal {
  const baseSaturation = profile?.baseSaturation ?? rng.range(45, 75);
  // Wachsende Märkte ziehen Anbieter an – der Zustrom folgt dem Trend
  // verzögert, weshalb schnelle Trends kurzfristig unterversorgt bleiben.
  const trendPressure = clamp(demand.growth12m * 22, -12, 18);
  const saturationIndex = round(clamp(rng.gaussian(baseSaturation + trendPressure, 6), 12, 96), 1);

  const listingCount = Math.round(
    demand.estimatedMonthlySearches * rng.range(0.6, 3.4) * (saturationIndex / 55),
  );
  const activeSellers = Math.max(20, Math.round(listingCount / rng.range(3.5, 14)));

  const top10SharePct = round(clamp(rng.gaussian(58 - saturationIndex * 0.45, 7), 6, 62), 1);
  const medianListingAgeDays = Math.round(
    clamp(rng.gaussian(520 - demand.growth12m * 260, 150), 70, 1500),
  );
  const newListings30dPct = round(
    clamp(rng.gaussian(9 + demand.growth90d * 40 + saturationIndex * 0.08, 4), 1, 45),
    1,
  );

  const entryBarrier =
    saturationIndex > 80 && top10SharePct > 38
      ? "high"
      : saturationIndex > 62 || top10SharePct > 30
        ? "medium"
        : "low";

  return {
    listingCount,
    activeSellers,
    saturationIndex,
    top10SharePct,
    medianListingAgeDays,
    newListings30dPct,
    entryBarrier,
  };
}

// --- Preise ----------------------------------------------------------------

function buildPricing(profile: NicheProfile | undefined, rng: Rng): PricingSignal {
  const median = round(clamp(rng.gaussian(profile?.priceLevel ?? 23, 5), 8, 90), 2);
  const spread = rng.range(0.25, 0.95);

  return {
    currency: "EUR",
    min: round(Math.max(4, median * rng.range(0.35, 0.55)), 2),
    p25: round(median * (1 - spread * 0.45), 2),
    median,
    p75: round(median * (1 + spread * 0.55), 2),
    max: round(median * rng.range(2.1, 4.6), 2),
    avgReviewsPerListing: round(rng.range(1.2, 34), 1),
  };
}

// --- Zielgruppe ------------------------------------------------------------

function buildAudience(profile: NicheProfile | undefined, rng: Rng): AudienceSignal {
  const pool = profile?.audiences ?? GENERIC.audiences;
  const chosen = rng.pickMany(pool, Math.min(pool.length, rng.int(3, 4)));
  const rawShares = chosen.map(() => rng.range(0.4, 1));
  const shareTotal = rawShares.reduce((sum, s) => sum + s, 0);

  const segments = chosen
    .map((label, index) => ({
      label,
      share: round((rawShares[index] ?? 0) / shareTotal, 3),
      evidence: rng.pick([
        "häufig in Listing-Titeln adressiert",
        "dominiert in Community-Diskussionen",
        "hohe Interaktionsrate auf visuellen Plattformen",
        "wiederkehrend in Bewertungstexten",
      ]),
    }))
    .sort((a, b) => b.share - a.share);

  const motivePool = profile?.motives ?? GENERIC.motives;
  const motives = rng
    .pickMany(motivePool, Math.min(motivePool.length, rng.int(3, 4)))
    .map((m) => ({ ...m, weight: round(rng.range(0.35, 1), 2) }))
    .sort((a, b) => b.weight - a.weight);

  return {
    segments,
    motives,
    giftPotential: round(clamp(rng.gaussian(profile?.giftPotential ?? 62, 9)), 1),
    emotionalIntensity: round(clamp(rng.gaussian(profile?.emotionalIntensity ?? 65, 9)), 1),
  };
}

// --- Design ----------------------------------------------------------------

function buildDesign(profile: NicheProfile | undefined, rng: Rng): DesignSignal {
  const palettePool = profile?.palettes ?? GENERIC.palettes;
  const paletteShares = palettePool.map(() => rng.range(0.3, 1));
  const paletteTotal = paletteShares.reduce((sum, s) => sum + s, 0);

  const palettes = palettePool
    .map((p, index) => ({ ...p, share: round((paletteShares[index] ?? 0) / paletteTotal, 3) }))
    .sort((a, b) => b.share - a.share);

  const typography = rng
    .pickMany(TYPOGRAPHY_STYLES, 3)
    .map((t, index) => ({ ...t, share: round([0.44, 0.32, 0.24][index] ?? 0.2, 2) }));

  const illustrationStyles = rng
    .pickMany(ILLUSTRATION_STYLES, 3)
    .map((style, index) => ({ style, share: round([0.41, 0.34, 0.25][index] ?? 0.2, 2) }));

  const motifPool = profile?.motifs ?? GENERIC.motifs;
  const motifs = rng
    .pickMany(motifPool, Math.min(motifPool.length, 4))
    .map((motif) => ({ motif, frequency: round(rng.range(0.12, 0.62), 3) }))
    .sort((a, b) => b.frequency - a.frequency);

  const leadPalette = palettes[0];
  const leadType = typography[0];
  const leadStyle = illustrationStyles[0];

  return {
    palettes,
    typography,
    illustrationStyles,
    motifs,
    observations: [
      leadPalette
        ? `"${leadPalette.name}" dominiert ${Math.round(leadPalette.share * 100)} % der sichtbaren Angebote.`
        : "Keine klar dominierende Farbwelt erkennbar.",
      leadType
        ? `${leadType.style} prägt die Typografie – ${leadType.note ?? "breit akzeptiert"}.`
        : "Typografie uneinheitlich.",
      leadStyle
        ? `Visuell führend: ${leadStyle.style} (${Math.round(leadStyle.share * 100)} %).`
        : "Kein dominanter Illustrationsstil.",
      motifs[0]
        ? `Häufigstes Motiv: ${motifs[0].motif} – hohe Wiedererkennung, aber auch hohe Ähnlichkeit im Wettbewerb.`
        : "Motive stark gestreut.",
    ],
  };
}

// --- Produktarten ----------------------------------------------------------

function buildProductTypes(
  profile: NicheProfile | undefined,
  pricing: PricingSignal,
  rng: Rng,
): ProductTypeSignal[] {
  const pool = profile?.productTypes ?? GENERIC.productTypes;
  const chosen = rng.pickMany(pool, Math.min(pool.length, rng.int(4, 6)));
  const raw = chosen.map((_, index) => rng.range(0.3, 1) * (1 - index * 0.08));
  const total = raw.reduce((sum, s) => sum + s, 0);

  return chosen
    .map((type, index) => ({
      type,
      share: round((raw[index] ?? 0) / total, 3),
      medianPrice: round(clamp(pricing.median * rng.range(0.6, 1.7), 5, 200), 2),
      growth90d: round(rng.gaussian(0.06, 0.22), 3),
    }))
    .sort((a, b) => b.share - a.share);
}

// --- Keywords --------------------------------------------------------------

function buildKeywords(
  term: string,
  profile: NicheProfile | undefined,
  demand: DemandSignal,
  competition: CompetitionSignal,
  rng: Rng,
): KeywordSignal[] {
  const modifiers = profile?.keywordModifiers ?? GENERIC.keywordModifiers;
  const productHints = (profile?.productTypes ?? GENERIC.productTypes).map((t) => t.toLowerCase());
  const base = term.toLowerCase();

  const combos = new Set<string>([base]);
  for (const modifier of rng.pickMany(modifiers, Math.min(modifiers.length, 6))) {
    combos.add(`${base} ${modifier}`);
  }
  for (const hint of rng.pickMany(productHints, 3)) {
    combos.add(`${base} ${hint}`);
  }

  return [...combos]
    .map((keyword) => {
      const isHead = keyword === base;
      const volumeIndex = round(
        clamp(
          isHead
            ? demand.volumeIndex
            : demand.volumeIndex * rng.range(0.18, 0.72) + rng.gaussian(0, 4),
        ),
        1,
      );
      // Der Oberbegriff bewegt sich definitionsgemäß mit dem Markt.
      const growth90d = isHead
        ? demand.growth90d
        : round(rng.gaussian(demand.growth90d, 0.18), 3);

      return {
        term: keyword,
        volumeIndex,
        growth90d,
        competition: round(
          clamp(
            isHead
              ? competition.saturationIndex
              : competition.saturationIndex * rng.range(0.55, 1.05),
          ),
          1,
        ),
        // "Steigend" heißt: schneller als der Gesamtmarkt. Der Oberbegriff
        // selbst kann das per Definition nicht sein.
        rising: !isHead && growth90d > demand.growth90d + 0.1,
      };
    })
    .sort((a, b) => b.volumeIndex - a.volumeIndex);
}

// --- Kategorie-Fallback ----------------------------------------------------

const FALLBACK_CATEGORIES = [
  "Lifestyle",
  "Hobby & Freizeit",
  "Beruf & Identität",
  "Anlässe",
  "Haus & Garten",
  "Sport",
];

function inferCategory(term: string, rng: Rng): string {
  if (!term) return "Allgemein";
  return rng.pick(FALLBACK_CATEGORIES);
}
