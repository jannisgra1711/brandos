import type {
  AnalysisSummary,
  MarketAnalysis,
  ProductProject,
  ProjectStatus,
  ProjectSummary,
} from "@/domain/types";

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

/**
 * Persistenz-Vertrag für Vorhaben.
 *
 * Getrennt vom Analyse-Repository, weil die beiden gegensätzliche Naturen
 * haben: Eine Analyse wird geschrieben und danach nur noch gelesen, ein
 * Vorhaben wird fortlaufend verändert. Ein gemeinsamer Vertrag müsste beides
 * zugleich versprechen und wäre für keins von beiden ehrlich.
 */
export interface ProjectRepository {
  save(project: ProductProject): Promise<void>;
  findById(id: string): Promise<ProductProject | undefined>;
  /** Zuletzt bearbeitete zuerst. Verworfene bleiben ohne Zutun aussen vor. */
  list(options?: ProjectListOptions): Promise<ProjectSummary[]>;
  /** Vorhaben, die aus einer bestimmten Analyse entstanden sind. */
  listByAnalysis(analysisId: string): Promise<ProjectSummary[]>;
  /**
   * Ändert die bearbeitbaren Felder und setzt `updatedAt`. Was nicht in
   * `changes` steht, bleibt – insbesondere `origin`, `analysisId` und
   * `createdAt`, die das Vorhaben nicht über sich selbst ändern darf.
   */
  update(
    id: string,
    changes: Partial<Pick<ProductProject, "title" | "status" | "notes" | "composition" | "listing">>,
    now?: Date,
  ): Promise<ProductProject | undefined>;
  remove(id: string): Promise<boolean>;
  count(status?: ProjectStatus): Promise<number>;
}

export interface ProjectListOptions {
  limit?: number;
  offset?: number;
  /** Genau ein Status. Setzt die Vorauswahl ausser Kraft. */
  status?: ProjectStatus;
  /** Verworfene mitführen. Ohne dieses Flag bleiben sie aussen vor. */
  includeDiscarded?: boolean;
}
