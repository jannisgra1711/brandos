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

/**
 * Signale, deren Herkunft nachgehalten wird – die Nutzlast-Schlüssel eines
 * Providers.
 */
export const PROVENANCE_KEYS = [
  "demand",
  "seasonality",
  "competition",
  "pricing",
  "audience",
  "design",
  "keywords",
  "productTypes",
] as const;

export type ProvenanceKey = (typeof PROVENANCE_KEYS)[number];

/**
 * Welche Quellen ein zusammengeführtes Signal getragen haben.
 *
 * `sources` in `MarketSignals` sagt, wer *befragt* wurde. Das genügt nicht:
 * Ein Lauf mit sieben Quellen, von denen fünf synthetisch sind, sagt nichts
 * darüber, ob ausgerechnet der Nachfragewert echt ist. Der Aggregator weiß
 * es im Moment der Zusammenführung – ohne diese Notiz geht es verloren, und
 * ein erfundener Wert steht in der Oberfläche neben einem gemessenen, ohne
 * unterscheidbar zu sein.
 */
export interface SignalProvenance {
  /** Beitragende Quellen, stärkster Beitrag zuerst. */
  sources: SourceId[];
  /**
   * Anteil synthetischer Beiträge, 0..1 – **gewichtet**, nicht gezählt.
   * Der Wert entstand als gewichtete Mischung, also muss seine Herkunft
   * genauso gewichtet sein: Eine schwach gewichtete Mock-Quelle neben einer
   * starken echten macht das Signal nicht zur Hälfte synthetisch.
   */
  syntheticShare: number;
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
  /**
   * Geschätztes monatliches Suchvolumen über alle Quellen.
   *
   * Optional, weil die wichtigste Nachfragequelle es nicht liefern kann:
   * Google Trends misst ausschließlich *relative* Nachfrage (Index 0..100),
   * absolute Volumina stammen aus Keyword-Werkzeugen. Fehlt der Wert, stützt
   * sich der Nachfrage-Faktor allein auf `volumeIndex` – das ist die Größe,
   * die tatsächlich gemessen wurde. Eine Hochrechnung wäre eine erfundene
   * Zahl, die in der Oberfläche wie eine gemessene aussähe.
   */
  estimatedMonthlySearches?: number;
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

/**
 * Was eine Marktplatzsuche hergibt, ist weniger als das, was ein
 * allwissender Datensatz hergäbe. Optional ist deshalb alles, was sich aus
 * einer Ergebnisliste nicht messen lässt – etwa das Alter der Listings oder
 * die Gesamtzahl der Anbieter jenseits der sichtbaren Seiten.
 *
 * Fehlende Felder sind kein Mangel der Quelle, sondern eine Lücke im Bild:
 * Der Aggregator füllt sie aus anderen Quellen, wenn es welche gibt, und das
 * Scoring behandelt sie sonst als Unsicherheit.
 */
export interface CompetitionSignal {
  listingCount: number;
  /** Nur messbar, wenn die Quelle über die sichtbaren Treffer hinaussieht. */
  activeSellers?: number;
  /**
   * 0..100 – 100 bedeutet vollständig übersättigt.
   *
   * Optional, weil es kein Messwert ist, sondern eine Einordnung: Eine
   * Suchergebnisliste kennt die Zahl ihrer Treffer, nicht deren Verhältnis
   * zur Nachfrage. Fehlt der Wert, leitet ihn das Scoring aus `listingCount`
   * ab – dort gehört die Normierung ohnehin hin.
   */
  saturationIndex?: number;
  /** Marktanteil der Top-10-Anbieter in Prozent. */
  top10SharePct: number;
  /** Medianalter der Listings in Tagen – junge Märkte sind angreifbar. */
  medianListingAgeDays?: number;
  /** Neue Listings der letzten 30 Tage in Prozent des Bestands. */
  newListings30dPct?: number;
  entryBarrier: EntryBarrier;
}

export interface PricingSignal {
  currency: string;
  min: number;
  p25: number;
  median: number;
  p75: number;
  max: number;
  /**
   * Durchschnittliche Bewertungsanzahl je **Listing** – Proxy für
   * Verkaufsdruck.
   *
   * Optional, und die Unterscheidung ist wichtig: Marktplätze weisen
   * überwiegend die Lebenszeit-Bewertungen des *Verkäufers* aus, nicht die
   * eines einzelnen Angebots. Das sind Größen unterschiedlicher
   * Größenordnung – eine für die andere einzusetzen, ergibt Zahlen im
   * Zehntausenderbereich, wo einstellige stehen müssten. Quellen, die nur
   * Verkäuferwerte kennen, lassen das Feld leer.
   */
  avgReviewsPerListing?: number;
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
  /**
   * Entwicklung der Produktart über 90 Tage.
   *
   * Optional, weil eine Listing-Suche einen Zustand zeigt, keinen Verlauf:
   * Sie sagt, was heute angeboten wird, nicht was vor drei Monaten angeboten
   * wurde. Ein Wachstum daraus abzuleiten hieße, zwei Messungen zu erfinden.
   * Fehlt der Wert, wertet der Ideengenerator ihn als neutral.
   */
  growth90d?: number;
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
  /**
   * Herkunft je Signal. Optional, weil vor der Einführung gespeicherte
   * Analysen sie nicht haben – Oberfläche und Scoring müssen ohne auskommen,
   * statt den Altbestand als synthetisch auszuweisen.
   */
  provenance?: Partial<Record<ProvenanceKey, SignalProvenance>>;
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
  /**
   * Quellen hinter dem Signal, aus dem dieser Faktor entsteht. Leer bei
   * `imputed` – ein geschätzter Faktor hat keine Quelle, er entstand gerade
   * mangels einer. Fehlt bei Analysen, die vor der Einführung entstanden.
   */
  sources?: SourceId[];
  /**
   * Gewichteter Anteil synthetischer Daten in diesem Faktor, 0..1.
   *
   * Ohne diese Angabe rendert ein Faktor aus einem Mock identisch zu einem
   * aus Google Trends: gleicher Balken, gleiche Begründung. Genau das soll
   * das Produkt nicht tun.
   */
  syntheticShare?: number;
}

export type OpportunityGrade = "A" | "B" | "C" | "D";

export interface OpportunityScore {
  /** 0..100 – gewichteter Gesamtscore. */
  value: number;
  grade: OpportunityGrade;
  /** 0..1 – Vertrauen in den Score, abgeleitet aus der Datenqualität. */
  confidence: number;
  factors: ScoreFactor[];
  /**
   * Anteil der Score-Gewichtung, der aus synthetischen Quellen stammt, 0..1.
   *
   * Nicht dasselbe wie `dataQuality.syntheticShare`: Jener zählt Quellen,
   * dieser gewichtet sie mit ihrem Einfluss auf die Zahl. Fünf Mocks, die
   * zusammen ein Zehntel des Scores tragen, sind etwas anderes als einer,
   * der ein Drittel trägt.
   */
  syntheticWeight?: number;
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
  /** Fehlt, wenn keine Quelle die Angebotsdichte einordnen konnte. */
  saturationIndex?: number;
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
