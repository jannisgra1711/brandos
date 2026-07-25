import type { AnalysisSummary, MarketAnalysis } from "@/domain/types";

/**
 * Persistenz-Vertrag.
 *
 * Die Services kennen ausschließlich dieses Interface. Die aktuelle
 * Implementierung schreibt JSON-Dateien; ein Wechsel auf Postgres oder SQLite
 * ist ein Austausch der Implementierung, keine Änderung der Aufrufer.
 *
 * Die Trennung zwischen `MarketAnalysis` (vollständig) und `AnalysisSummary`
 * (kompakt) ist bewusst Teil des Vertrags: Listenansichten dürfen niemals
 * gezwungen sein, komplette Analysen mit Zeitreihen zu laden.
 */
export interface AnalysisRepository {
  save(analysis: MarketAnalysis): Promise<void>;
  findById(id: string): Promise<MarketAnalysis | undefined>;
  /** Kompakte Form ohne Laden der vollständigen Analyse. */
  findSummaryById(id: string): Promise<AnalysisSummary | undefined>;
  /** Neueste zuerst. */
  list(options?: ListOptions): Promise<AnalysisSummary[]>;
  /** Letzte Analyse zu einem Begriff – Grundlage für Cache-Treffer. */
  findLatestByTerm(term: string, market: string): Promise<AnalysisSummary | undefined>;
  setSaved(id: string, saved: boolean): Promise<AnalysisSummary | undefined>;
  remove(id: string): Promise<boolean>;
  count(): Promise<number>;
}

export interface ListOptions {
  limit?: number;
  offset?: number;
  /** Nur als gespeichert markierte Analysen. */
  savedOnly?: boolean;
  /** Freitextfilter auf den Suchbegriff. */
  term?: string;
}
