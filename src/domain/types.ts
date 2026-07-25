/**
 * BrandOS – Domain Model
 *
 * Diese Datei beschreibt die Sprache des Produkts. Sie ist bewusst frei von
 * Framework-, Netzwerk- und UI-Abhängigkeiten: jede Schicht (Provider, AI,
 * Services, UI) spricht über diese Typen miteinander.
 *
 * Leitregel: Ein Typ beschreibt *was* eine Information bedeutet, niemals
 * *woher* sie technisch stammt. Die Herkunft wird separat über
 * `SourceContribution` protokolliert, damit jede Aussage im UI belegbar bleibt.
 */

// ---------------------------------------------------------------------------
// Quellen & Datenherkunft
// ---------------------------------------------------------------------------

/**
 * Bekannte Datenquellen. Neue Quellen werden hier ergänzt und im
 * Provider-Registry registriert – der Rest der Anwendung bleibt unberührt.
 */
export const SOURCE_IDS = [
  "etsy",
  "google-trends",
  "pinterest",
  "reddit",
  "tiktok",
  "amazon",
  "ebay",
  "youtube",
] as const;

export type SourceId = (typeof SOURCE_IDS)[number];

/**
 * Fachliche Fähigkeiten, die eine Quelle liefern kann. Der Aggregator nutzt
 * sie, um zu entscheiden, welcher Provider für welchen Signaltyp zuständig
 * ist – und um Lücken sichtbar zu machen.
 */
export const CAPABILITIES = [
  "demand",
  "competition",
  "pricing",
  "audience",
  "design",
  "keywords",
  "products",
  "discovery",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

export type SourceStatus = "ok" | "degraded" | "unavailable" | "timeout" | "error";

/** Protokoll eines einzelnen Provider-Aufrufs – Grundlage für Transparenz. */
export interface SourceContribution {
  source: SourceId;
  label: string;
  status: SourceStatus;
  /** true, wenn synthetische Daten geliefert wurden (kein echter API-Zugriff). */
  synthetic: boolean;
  /** Selbsteinschätzung des Providers, 0..1. */
  confidence: number;
  capabilities: Capability[];
  latencyMs: number;
  /** Alter der zugrunde liegenden Daten in Tagen. */
  freshnessDays: number;
  message?: string;
}

// ---------------------------------------------------------------------------
// Anfrage
// ---------------------------------------------------------------------------

export interface MarketQuery {
  /** Freitext des Nutzers, z. B. "Camping", "Hunde", "Lehrer". */
  term: string;
  /** Optionale fachliche Eingrenzung, z. B. "apparel", "home-decor". */
  category?: string;
  /** Marktplatz-/Länder-Kontext, ISO-Code. Default "DE". */
  market?: string;
  /** Zeitfenster für Trendbetrachtungen in Monaten. Default 24. */
  windowMonths?: number;
}

// ---------------------------------------------------------------------------
// Signale (das Rohmaterial der Analyse)
// ---------------------------------------------------------------------------

export interface TimePoint {
  /** ISO-Monat, z. B. "2026-03". */
  period: string;
  value: number;
}

export type TrendDirection = "rising" | "stable" | "declining" | "volatile";

export interface DemandSignal {
  /** Normalisierter Nachfrageindex 0..100 (100 = Top-Perzentil im Datensatz). */
  volumeIndex: number;
  /** Geschätztes monatliches Suchvolumen über alle Quellen. */
  estimatedMonthlySearches: number;
  growth90d: number;
  growth12m: number;
  direction: TrendDirection;
  series: TimePoint[];
}

export interface SeasonalitySignal {
  /** 0..1 – wie stark schwankt die Nachfrage über das Jahr? */
  amplitude: number;
  /** Monatsindizes 1..12 mit relativem Faktor (1 = Jahresdurchschnitt). */
  monthlyIndex: number[];
  peakMonths: number[];
  lowMonths: number[];
  /** z. B. "Weihnachten", "Muttertag" – erklärt den Peak. */
  drivers: string[];
}

export type EntryBarrier = "low" | "medium" | "high";

export interface CompetitionSignal {
  listingCount: number;
  activeSellers: number;
  /** 0..100 – 100 bedeutet vollständig übersättigt. */
  saturationIndex: number;
  /** Marktanteil der Top-10-Anbieter in Prozent. */
  top10SharePct: number;
  /** Medianalter der Listings in Tagen – junge Märkte sind angreifbar. */
  medianListingAgeDays: number;
  /** Neue Listings der letzten 30 Tage in Prozent des Bestands. */
  newListings30dPct: number;
  entryBarrier: EntryBarrier;
}

export interface PricingSignal {
  currency: string;
  min: number;
  p25: number;
  median: number;
  p75: number;
  max: number;
  /** Durchschnittliche Bewertungsanzahl je Listing – Proxy für Verkaufsdruck. */
  avgReviewsPerListing: number;
}

export interface AudienceSegment {
  label: string;
  /** Anteil an der erkennbaren Zielgruppe, 0..1. */
  share: number;
  evidence: string;
}

export interface PurchaseMotive {
  label: string;
  /** Relative Stärke des Motivs, 0..1. */
  weight: number;
  /** "emotional" trifft impulsiver, "functional" rationaler. */
  kind: "emotional" | "functional" | "social" | "identity";
}

export interface AudienceSignal {
  segments: AudienceSegment[];
  motives: PurchaseMotive[];
  /** 0..100 – wie stark eignet sich der Markt für Geschenkkäufe? */
  giftPotential: number;
  /** 0..100 – wie stark ist die emotionale Bindung an die Nische? */
  emotionalIntensity: number;
}

export interface ColorPalette {
  name: string;
  /** Hex-Werte, dominante Farbe zuerst. */
  colors: string[];
  /** Anteil der Listings, in denen die Palette dominiert, 0..1. */
  share: number;
}

export interface DesignSignal {
  palettes: ColorPalette[];
  typography: { style: string; share: number; note?: string }[];
  illustrationStyles: { style: string; share: number }[];
  motifs: { motif: string; frequency: number }[];
  /** Kurze Beobachtungen zu visuellen Mustern. */
  observations: string[];
}

export interface KeywordSignal {
  term: string;
  volumeIndex: number;
  growth90d: number;
  /** 0..100 – Wettbewerbsdruck auf diesem Keyword. */
  competition: number;
  /** true, wenn der Begriff überdurchschnittlich stark wächst. */
  rising: boolean;
}

export interface ProductTypeSignal {
  type: string;
  /** Anteil am Angebot, 0..1. */
  share: number;
  medianPrice: number;
  growth90d: number;
}

export interface DataQuality {
  /** Anteil abgedeckter Capabilities, 0..1. */
  coverage: number;
  sourceCount: number;
  syntheticShare: number;
  freshnessDays: number;
  /** Gesamtvertrauen in die Datenbasis, 0..1. */
  confidence: number;
}

/**
 * Das aggregierte Rohmaterial einer Recherche. Alle Felder ausser `query`,
 * `sources` und `dataQuality` sind optional: BrandOS muss auch dann eine
 * Aussage treffen können, wenn nur ein Teil der Quellen antwortet.
 */
export interface MarketSignals {
  query: MarketQuery;
  collectedAt: string;
  sources: SourceContribution[];
  demand?: DemandSignal;
  seasonality?: SeasonalitySignal;
  competition?: CompetitionSignal;
  pricing?: PricingSignal;
  audience?: AudienceSignal;
  design?: DesignSignal;
  keywords: KeywordSignal[];
  productTypes: ProductTypeSignal[];
  dataQuality: DataQuality;
}

// ---------------------------------------------------------------------------
// Bewertung
// ---------------------------------------------------------------------------

export const SCORE_FACTORS = [
  "demand",
  "trend",
  "competition",
  "marketAge",
  "giftPotential",
  "emotionalPull",
  "productVariety",
  "seasonalFit",
  "priceHeadroom",
] as const;

export type ScoreFactorKey = (typeof SCORE_FACTORS)[number];

export interface ScoreFactor {
  key: ScoreFactorKey;
  label: string;
  /** Normalisierter Beitrag 0..100 (höher = besser für die Chance). */
  value: number;
  /** Gewicht im Gesamtscore, Summe aller Gewichte = 1. */
  weight: number;
  /** Menschlich lesbare Begründung – Pflicht, damit kein Wert unerklärt bleibt. */
  rationale: string;
  /** Fehlt die Datengrundlage, wird ein neutraler Wert angenommen. */
  imputed: boolean;
}

export type OpportunityGrade = "A" | "B" | "C" | "D";

export interface OpportunityScore {
  /** 0..100 – gewichteter Gesamtscore. */
  value: number;
  grade: OpportunityGrade;
  /** 0..1 – Vertrauen in den Score, abgeleitet aus der Datenqualität. */
  confidence: number;
  factors: ScoreFactor[];
  /** Die stärksten Treiber nach oben. */
  drivers: string[];
  /** Die stärksten Bremsen. */
  drags: string[];
}

// ---------------------------------------------------------------------------
// Interpretation (AI-Layer)
// ---------------------------------------------------------------------------

export type InsightKind = "opportunity" | "risk" | "pattern" | "audience" | "design" | "timing";

export interface Insight {
  kind: InsightKind;
  title: string;
  detail: string;
  /** 0..1 – wie sicher ist die Aussage? */
  confidence: number;
  /** Quellen-/Signalbelege, auf die sich die Aussage stützt. */
  evidence: string[];
}

export interface ProductIdea {
  id: string;
  title: string;
  /** Die Bausteine, aus denen die Idee kombiniert wurde. */
  composition: {
    niche: string;
    productType: string;
    audience: string;
    emotion: string;
    style: string;
    differentiator: string;
  };
  rationale: string;
  /** 0..100 – geschätztes Potenzial der konkreten Idee. */
  potential: number;
  /** 0..100 – wie stark hebt sich die Idee vom Bestandsangebot ab? */
  distinctiveness: number;
  suggestedPriceRange: { min: number; max: number; currency: string };
  risks: string[];
}

export interface MarketInterpretation {
  /** 2–3 Sätze: Was ist hier los? */
  summary: string;
  /** Die entscheidende Aussage in einem Satz. */
  verdict: string;
  insights: Insight[];
  opportunities: string[];
  risks: string[];
  recommendedActions: string[];
  ideas: ProductIdea[];
  /** Kennzeichnet, ob ein Modell oder die Heuristik interpretiert hat. */
  producedBy: { analyst: string; model?: string; degraded: boolean };
}

// ---------------------------------------------------------------------------
// Ergebnis & Persistenz
// ---------------------------------------------------------------------------

export interface MarketAnalysis {
  id: string;
  query: MarketQuery;
  createdAt: string;
  durationMs: number;
  signals: MarketSignals;
  score: OpportunityScore;
  interpretation: MarketInterpretation;
}

/** Kompakte Form für Listen, Historie und Dashboard-Kacheln. */
export interface AnalysisSummary {
  id: string;
  term: string;
  market: string;
  createdAt: string;
  score: number;
  grade: OpportunityGrade;
  confidence: number;
  verdict: string;
  trend: TrendDirection;
  saved: boolean;
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

export type OpportunityKind =
  | "niche"
  | "audience-product"
  | "trend"
  | "seasonal"
  | "evergreen"
  | "unconventional";

/**
 * Saisonlage eines Kandidaten.
 *
 * `monthsToPeak` beantwortet die eigentliche Handlungsfrage – "wann muss ich
 * fertig sein?" – und ist deshalb Teil des Discovery-Ergebnisses, nicht erst
 * der Detailanalyse.
 */
export interface SeasonalWindow {
  peakMonths: number[];
  /** Monate bis zum nächsten Peak (0 = Peak läuft gerade). */
  monthsToPeak: number;
  /**
   * Der Peak-Monat, auf den sich `monthsToPeak` bezieht (1..12).
   *
   * Bei mehreren Peaks ist das nicht zwingend der erste Eintrag in
   * `peakMonths` – deshalb wird er hier aufgelöst, statt ihn in der
   * Darstellung erneut herzuleiten.
   */
  nextPeakMonth: number;
  /** 0..1 – unter 0.15 gilt der Markt als ganzjährig. */
  amplitude: number;
}

export interface DiscoveryOpportunity {
  id: string;
  term: string;
  kind: OpportunityKind;
  category: string;
  score: number;
  grade: OpportunityGrade;
  confidence: number;
  /** Ein Satz, warum genau das jetzt interessant ist. */
  reason: string;
  /** Die zwei bis drei stärksten Belege. */
  evidence: string[];
  demandIndex: number;
  growth90d: number;
  saturationIndex: number;
  direction: TrendDirection;
  sparkline: number[];
  /** Fehlt, wenn keine Quelle Saisonsignale geliefert hat. */
  seasonality?: SeasonalWindow;
}

export interface TrendMover {
  term: string;
  category: string;
  growth90d: number;
  demandIndex: number;
  direction: TrendDirection;
  sparkline: number[];
}

export interface DashboardOverview {
  generatedAt: string;
  /** Kennzahlen für die Kopfzeile. */
  stats: {
    trackedNiches: number;
    risingMarkets: number;
    avgOpportunityScore: number;
    analysesRun: number;
  };
  topOpportunities: DiscoveryOpportunity[];
  risingTrends: TrendMover[];
  seasonalWindows: DiscoveryOpportunity[];
  saturatedMarkets: TrendMover[];
  recentAnalyses: AnalysisSummary[];
  savedAnalyses: AnalysisSummary[];
  dataMode: "live" | "mixed" | "mock";
}
