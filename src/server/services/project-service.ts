import "server-only";
import { randomUUID } from "node:crypto";
import { buildListingDraft } from "@/domain/listing";
import type { ListingDraft, ProductProject, ProjectStatus, ProjectSummary } from "@/domain/types";
import { logger } from "@/server/logging/logger";
import { getAnalysisRepository, getProjectRepository, type ProjectListOptions } from "@/server/repositories";

/**
 * Vorhaben – der Schritt von der Erkenntnis zur Arbeit.
 *
 * Eine Analyse endet mit Ideenskizzen. Wer eine davon weiterverfolgt, trifft
 * eine Entscheidung, und ab da ist die Analyse nur noch Hintergrund. Dieser
 * Dienst hält den Übergang fest.
 *
 * Wie `history-service` bleibt er dünn: Er kennt die Fachlogik der Übernahme
 * und überlässt alles Weitere dem Repository.
 */

export interface CreateProjectInput {
  analysisId: string;
  /** Die Idee aus der Interpretation der Analyse. */
  ideaId: string;
  /** Überschreibt den Titel der Idee. */
  title?: string;
  now?: Date;
}

/** Warum eine Übernahme nicht möglich war – für eine brauchbare Fehlermeldung. */
export type CreateProjectFailure = "analysis-not-found" | "idea-not-found";

export async function createProjectFromIdea(
  input: CreateProjectInput,
): Promise<ProductProject | CreateProjectFailure> {
  const analysis = await getAnalysisRepository().findById(input.analysisId);
  if (!analysis) return "analysis-not-found";

  const idea = analysis.interpretation.ideas.find((i) => i.id === input.ideaId);
  if (!idea) return "idea-not-found";

  const now = input.now ?? new Date();
  const timestamp = now.toISOString();

  const project: ProductProject = {
    id: randomUUID(),
    analysisId: analysis.id,
    // Mitgeführt, damit das Vorhaben aussagefähig bleibt, wenn die Analyse
    // gelöscht wird.
    term: analysis.query.term,
    market: analysis.query.market ?? "DE",
    title: input.title?.trim() || idea.title,
    status: "idee",
    composition: { ...idea.composition },
    suggestedPriceRange: { ...idea.suggestedPriceRange },
    origin: {
      ideaId: idea.id,
      score: analysis.score.value,
      grade: analysis.score.grade,
      potential: idea.potential,
      distinctiveness: idea.distinctiveness,
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await getProjectRepository().save(project);

  logger.child("projects").info("Vorhaben angelegt", {
    id: project.id,
    term: project.term,
    from: analysis.id,
  });

  return project;
}

export function listProjects(options: ProjectListOptions = {}): Promise<ProjectSummary[]> {
  return getProjectRepository().list(options);
}

export function getProject(id: string): Promise<ProductProject | undefined> {
  return getProjectRepository().findById(id);
}

export function projectsForAnalysis(analysisId: string): Promise<ProjectSummary[]> {
  return getProjectRepository().listByAnalysis(analysisId);
}

export function updateProject(
  id: string,
  changes: Partial<Pick<ProductProject, "title" | "status" | "notes" | "composition">>,
): Promise<ProductProject | undefined> {
  return getProjectRepository().update(id, changes);
}

/**
 * Erzeugt den Listing-Entwurf neu.
 *
 * Die Signale kommen aus der Ursprungsanalyse, wenn es sie noch gibt. Fehlt
 * sie, entsteht trotzdem ein Entwurf – nur ohne gemessene Kategorie und mit
 * dem Preiskorridor der Idee statt dem Median des Marktes. Was fehlt, steht
 * anschliessend in `basis`.
 *
 * Ein bestehender Entwurf wird **ersetzt**, auch von Hand geänderte Felder.
 * Deshalb ist das eine ausdrückliche Handlung und passiert nie nebenbei.
 */
export async function generateListing(
  projectId: string,
  now = new Date(),
): Promise<ProductProject | undefined> {
  const project = await getProjectRepository().findById(projectId);
  if (!project) return undefined;

  const analysis = await getAnalysisRepository().findById(project.analysisId);

  const listing = buildListingDraft({ project, signals: analysis?.signals, now });

  logger.child("projects").info("Listing-Entwurf erzeugt", {
    id: project.id,
    grounded: analysis !== undefined,
    tags: listing.tags.length,
  });

  return getProjectRepository().update(projectId, { listing }, now);
}

/** Welche Felder von Hand geändert werden dürfen. */
export interface ListingEdit {
  title?: string;
  tags?: string[];
  description?: string;
  price?: { value: number; currency: string };
}

/**
 * Ändert einzelne Felder des Entwurfs.
 *
 * **Eine Handänderung ersetzt die Herkunft des Feldes.** Der alte Vermerk
 * beschriebe sonst eine Ableitung, die für den neuen Wert nie stattgefunden
 * hat – und ein von Hand geschriebener Titel sähe aus, als käme er aus einer
 * Messung. Das ist genau die Verwechslung, die das Produkt vermeidet.
 */
export async function editListing(
  projectId: string,
  edit: ListingEdit,
  now = new Date(),
): Promise<ProductProject | undefined | "no-listing"> {
  const project = await getProjectRepository().findById(projectId);
  if (!project) return undefined;
  if (!project.listing) return "no-listing";

  const listing: ListingDraft = { ...project.listing, basis: { ...project.listing.basis } };

  for (const field of ["title", "tags", "description", "price"] as const) {
    if (edit[field] === undefined) continue;

    if (field === "title") listing.title = edit.title as string;
    if (field === "tags") listing.tags = edit.tags as string[];
    if (field === "description") listing.description = edit.description;
    if (field === "price") listing.price = edit.price;

    listing.basis[field] = {
      rationale: "Von Hand geändert.",
      sources: [],
      synthetic: false,
    };
  }

  return getProjectRepository().update(projectId, { listing }, now);
}

export function deleteProject(id: string): Promise<boolean> {
  return getProjectRepository().remove(id);
}

export function countProjects(status?: ProjectStatus): Promise<number> {
  return getProjectRepository().count(status);
}
