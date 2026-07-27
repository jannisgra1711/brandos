import "server-only";
import { JsonAnalysisRepository } from "./json-analysis-repository";
import { JsonProjectRepository } from "./json-project-repository";
import type { AnalysisRepository, ProjectRepository } from "./types";

export type {
  AnalysisRepository,
  ListOptions,
  ProjectListOptions,
  ProjectRepository,
} from "./types";
export { JsonAnalysisRepository, toSummary } from "./json-analysis-repository";
export { JsonProjectRepository } from "./json-project-repository";

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

let projects: ProjectRepository | undefined;

export function getProjectRepository(): ProjectRepository {
  projects ??= new JsonProjectRepository();
  return projects;
}

/** Nur für Tests. */
export function setProjectRepository(repository: ProjectRepository | undefined): void {
  projects = repository;
}
