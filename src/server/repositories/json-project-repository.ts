import "server-only";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import type { ProductProject, ProjectStatus, ProjectSummary } from "@/domain/types";
import { getConfig } from "@/server/config/env";
import { logger } from "@/server/logging/logger";
import { createWriteChain, isNotFound, isSafeId, writeAtomic } from "./json-store";
import type { ProjectListOptions, ProjectRepository } from "./types";

/**
 * Dateibasierte Persistenz für Vorhaben.
 *
 * Aufbau, parallel zu den Analysen:
 *   .data/projects/<id>.json      – vollständiges Vorhaben
 *   .data/projects-index.json     – Zusammenfassungen für die Übersicht
 *
 * **Sortiert nach `updatedAt`, nicht nach `createdAt`.** Eine Analyse ist ein
 * Protokoll und bleibt, wo sie entstand; ein Vorhaben wird bearbeitet, und was
 * zuletzt angefasst wurde, ist das, woran gearbeitet wird.
 */

interface IndexFile {
  version: 1;
  entries: ProjectSummary[];
}

const EMPTY_INDEX: IndexFile = { version: 1, entries: [] };

export class JsonProjectRepository implements ProjectRepository {
  private readonly log = logger.child("projects");
  private readonly root: string;
  private readonly projectsDir: string;
  private readonly indexPath: string;
  private readonly enqueue = createWriteChain();

  constructor(dataDir?: string) {
    this.root = path.resolve(/* turbopackIgnore: true */ process.cwd(), dataDir ?? getConfig().storage.dataDir);
    this.projectsDir = path.join(this.root, "projects");
    this.indexPath = path.join(this.root, "projects-index.json");
  }

  async save(project: ProductProject): Promise<void> {
    if (!isSafeId(project.id)) {
      throw new Error(`Unzulässige Vorhaben-ID: ${JSON.stringify(project.id)}`);
    }

    await this.enqueue(async () => {
      await mkdir(this.projectsDir, { recursive: true });
      await writeAtomic(this.filePath(project.id), JSON.stringify(project, null, 2));

      const index = await this.readIndex();
      const entries = [
        toSummary(project),
        ...index.entries.filter((e) => e.id !== project.id),
      ];
      await this.writeIndex({ version: 1, entries });

      this.log.debug("Vorhaben gespeichert", { id: project.id, status: project.status });
    });
  }

  async findById(id: string): Promise<ProductProject | undefined> {
    if (!isSafeId(id)) return undefined;
    try {
      return JSON.parse(await readFile(this.filePath(id), "utf8")) as ProductProject;
    } catch (error) {
      if (isNotFound(error)) return undefined;
      this.log.error("Vorhaben konnte nicht gelesen werden", { id, error: String(error) });
      return undefined;
    }
  }

  async list(options: ProjectListOptions = {}): Promise<ProjectSummary[]> {
    const index = await this.readIndex();

    let entries = index.entries;
    if (options.status) entries = entries.filter((e) => e.status === options.status);
    // Verworfenes gehört nicht in die Arbeitsansicht, aber es zu löschen wäre
    // eine andere Entscheidung als es beiseitezulegen.
    else if (options.includeDiscarded !== true) {
      entries = entries.filter((e) => e.status !== "verworfen");
    }

    entries = [...entries].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    const offset = options.offset ?? 0;
    return entries.slice(offset, offset + (options.limit ?? 50));
  }

  /** Alle Vorhaben zu einer Analyse – für den Hinweis „bereits übernommen". */
  async listByAnalysis(analysisId: string): Promise<ProjectSummary[]> {
    if (!isSafeId(analysisId)) return [];
    const index = await this.readIndex();
    return index.entries.filter((e) => e.analysisId === analysisId);
  }

  async update(
    id: string,
    changes: Partial<Pick<ProductProject, "title" | "status" | "notes" | "composition" | "listing">>,
    now = new Date(),
  ): Promise<ProductProject | undefined> {
    if (!isSafeId(id)) return undefined;

    return this.enqueue(async () => {
      const existing = await this.findById(id);
      if (!existing) return undefined;

      const updated: ProductProject = {
        ...existing,
        ...changes,
        // Die Herkunft ist eingefroren – sie beschreibt den Moment der
        // Übernahme und darf sich nicht mit dem Vorhaben mitbewegen.
        origin: existing.origin,
        id: existing.id,
        analysisId: existing.analysisId,
        createdAt: existing.createdAt,
        updatedAt: now.toISOString(),
      };

      await writeAtomic(this.filePath(id), JSON.stringify(updated, null, 2));

      const index = await this.readIndex();
      await this.writeIndex({
        version: 1,
        entries: index.entries.map((e) => (e.id === id ? toSummary(updated) : e)),
      });

      return updated;
    });
  }

  async remove(id: string): Promise<boolean> {
    if (!isSafeId(id)) return false;
    return this.enqueue(async () => {
      const index = await this.readIndex();
      const exists = index.entries.some((e) => e.id === id);

      await rm(this.filePath(id), { force: true });
      await this.writeIndex({ version: 1, entries: index.entries.filter((e) => e.id !== id) });

      return exists;
    });
  }

  async count(status?: ProjectStatus): Promise<number> {
    const index = await this.readIndex();
    return status ? index.entries.filter((e) => e.status === status).length : index.entries.length;
  }

  // -------------------------------------------------------------------------

  private filePath(id: string): string {
    return path.join(this.projectsDir, `${id}.json`);
  }

  private async readIndex(): Promise<IndexFile> {
    try {
      const parsed = JSON.parse(await readFile(this.indexPath, "utf8")) as IndexFile;
      return Array.isArray(parsed.entries) ? parsed : EMPTY_INDEX;
    } catch (error) {
      if (isNotFound(error)) return EMPTY_INDEX;
      this.log.warn("Index unlesbar – wird als leer behandelt", { error: String(error) });
      return EMPTY_INDEX;
    }
  }

  private async writeIndex(index: IndexFile): Promise<void> {
    await writeAtomic(this.indexPath, JSON.stringify(index, null, 2));
  }
}

// ---------------------------------------------------------------------------

export function toSummary(project: ProductProject): ProjectSummary {
  return {
    id: project.id,
    analysisId: project.analysisId,
    ideaId: project.origin.ideaId,
    title: project.title,
    term: project.term,
    status: project.status,
    productType: project.composition.productType,
    score: project.origin.score,
    grade: project.origin.grade,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}
