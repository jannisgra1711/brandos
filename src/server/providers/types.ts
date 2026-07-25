import type {
  AudienceSignal,
  Capability,
  CompetitionSignal,
  DemandSignal,
  DesignSignal,
  KeywordSignal,
  MarketQuery,
  OpportunityKind,
  PricingSignal,
  ProductTypeSignal,
  SeasonalitySignal,
  SourceId,
} from "@/domain/types";
import type { Logger } from "@/server/logging/logger";

/**
 * Der Provider-Vertrag.
 *
 * Jede Datenquelle implementiert genau dieses Interface. Die Anwendung kennt
 * ausschließlich diesen Vertrag – nie einen konkreten Anbieter. Dadurch ist
 * das Hinzufügen einer Quelle eine reine Registry-Änderung.
 *
 * Ein Provider liefert immer nur die Signale, für die er zuständig ist
 * (`capabilities`). Fehlende Felder sind kein Fehler, sondern der Normalfall.
 */

export interface ProviderPayload {
  demand?: DemandSignal;
  seasonality?: SeasonalitySignal;
  competition?: CompetitionSignal;
  pricing?: PricingSignal;
  audience?: AudienceSignal;
  design?: DesignSignal;
  keywords?: KeywordSignal[];
  productTypes?: ProductTypeSignal[];
}

export interface ProviderContext {
  now: Date;
  logger: Logger;
  /** Wird bei Timeout oder Nutzerabbruch ausgelöst. */
  signal: AbortSignal;
}

export interface ProviderResult {
  /** Selbsteinschätzung der Aussagekraft, 0..1. */
  confidence: number;
  /** true, wenn die Daten synthetisch erzeugt wurden. */
  synthetic: boolean;
  /** Alter der zugrunde liegenden Daten in Tagen. */
  freshnessDays: number;
  payload: ProviderPayload;
  /** Optionaler Hinweis, der im UI als Quellenanmerkung erscheint. */
  message?: string;
}

/** Ein Vorschlag des Providers für die eigenständige Chancensuche. */
export interface DiscoverySeed {
  term: string;
  category: string;
  kind: OpportunityKind;
  /** Warum diese Quelle den Begriff vorschlägt. */
  hint: string;
}

export interface DataProvider {
  readonly id: SourceId;
  readonly label: string;
  readonly capabilities: readonly Capability[];
  /**
   * "live" spricht mit einer echten API, "mock" erzeugt synthetische Daten.
   * Die Registry bevorzugt für jede Quelle die Live-Variante, sobald sie
   * verfügbar ist – der Rest der Anwendung merkt davon nichts.
   */
  readonly kind: "live" | "mock";
  /**
   * Priorisierung bei konkurrierenden Signalen desselben Typs.
   * Höher gewinnt – bei Gleichstand entscheidet die Konfidenz.
   */
  readonly priority: number;
  /** true, sobald die nötigen Zugangsdaten vorhanden sind. */
  isAvailable(): boolean;
  fetch(query: MarketQuery, context: ProviderContext): Promise<ProviderResult>;
  /** Optional: eigenständige Vorschläge für die Discovery. */
  discover?(context: ProviderContext): Promise<DiscoverySeed[]>;
}

// Felder bewusst ausgeschrieben statt als Parameter-Properties: Letztere
// erzeugen Laufzeitcode und sind daher in Nodes Type-Stripping-Modus – und
// damit im Testlauf – nicht verwendbar.
export class ProviderError extends Error {
  readonly source: SourceId;
  override readonly cause?: unknown;

  constructor(source: SourceId, message: string, cause?: unknown) {
    super(message);
    this.name = "ProviderError";
    this.source = source;
    this.cause = cause;
  }
}
