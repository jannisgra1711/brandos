import "server-only";
import { JsonAnalysisRepository } from "./json-analysis-repository";
import type { AnalysisRepository } from "./types";

export type { AnalysisRepository, ListOptions } from "./types";
export { JsonAnalysisRepository, toSummary } from "./json-analysis-repository";

/**
 * Zusammensetzung der Persistenzschicht.
 *
 * Genau eine Instanz pro Prozess – der Repository hält eine Schreibkette,
 * die nur wirkt, wenn alle Zugriffe durch dieselbe Instanz laufen.
 */
let instance: AnalysisRepository | undefined;

export function getAnalysisRepository(): AnalysisRepository {
  instance ??= new JsonAnalysisRepository();
  return instance;
}

/** Nur für Tests. */
export function setAnalysisRepository(repository: AnalysisRepository | undefined): void {
  instance = repository;
}
