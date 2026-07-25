import type { MarketInterpretation, MarketSignals, OpportunityScore } from "@/domain/types";

/**
 * Der Analyst-Vertrag.
 *
 * BrandOS kennt nur diese Schnittstelle, nie ein konkretes Modell. Das hat
 * zwei Gründe:
 *
 * 1. Austauschbarkeit – Modell, Anbieter oder eine rein regelbasierte Engine
 *    sind gegeneinander ersetzbar.
 * 2. Verfügbarkeit – wenn kein Modell erreichbar ist, muss das Produkt
 *    trotzdem eine Aussage treffen. Deshalb ist die Heuristik kein Notnagel,
 *    sondern eine vollwertige Implementierung derselben Schnittstelle.
 */

export interface InterpretationInput {
  signals: MarketSignals;
  score: OpportunityScore;
  /** Wie viele Produktideen erzeugt werden sollen. */
  ideaCount?: number;
}

export interface Analyst {
  /** Technischer Bezeichner, erscheint in der Ergebnisherkunft. */
  readonly id: string;
  readonly label: string;
  /** false, wenn z. B. kein API-Key hinterlegt ist. */
  isAvailable(): boolean;
  interpret(input: InterpretationInput): Promise<MarketInterpretation>;
}

// Siehe ProviderError: keine Parameter-Properties, damit die Klasse auch im
// Type-Stripping-Modus von Node ladbar bleibt.
export class AnalystError extends Error {
  readonly analyst: string;
  override readonly cause?: unknown;

  constructor(analyst: string, message: string, cause?: unknown) {
    super(message);
    this.name = "AnalystError";
    this.analyst = analyst;
    this.cause = cause;
  }
}
