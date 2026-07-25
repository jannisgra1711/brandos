import "server-only";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AnalysisSummary, MarketAnalysis } from "@/domain/types";
import { getConfig } from "@/server/config/env";
import { logger } from "@/server/logging/logger";
import type { AnalysisRepository, ListOptions } from "./types";

/**
 * Dateibasierte Persistenz.
 *
 * Warum JSON statt Datenbank? Weil die einzige heutige Anforderung
 * "Analysen wiederfinden" lautet und eine Datei diesen Bedarf ohne
 * Betriebsaufwand, Migrationen und native Abhängigkeiten deckt. Der Vertrag
 * (`AnalysisRepository`) ist so geschnitten, dass der spätere Wechsel auf
 * Postgres genau diese Datei ersetzt.
 *
 * Aufbau:
 *   .data/analyses/<id>.json   – vollständige Analyse
 *   .data/index.json           – Zusammenfassungen für Listen
 *
 * Der Index existiert, damit Listenansichten nicht jede Analyse einlesen
 * müssen. Er ist abgeleitet und jederzeit aus den Einzeldateien
 * rekonstruierbar (`rebuildIndex`).
 */

interface IndexFile {
  version: 1;
  entries: AnalysisSummary[];
}

const EMPTY_INDEX: IndexFile = { version: 1, entries: [] };

export class JsonAnalysisRepository implements AnalysisRepository {
  private readonly log = logger.child("repository");
  private readonly root: string;
  private readonly analysesDir: string;
  private readonly indexPath: string;

  /**
   * Serialisiert Schreibzugriffe. Node.js ist single-threaded, aber
   * `await` zwischen Lesen und Schreiben des Index erlaubt Verschränkung –
   * ohne diese Kette gehen bei parallelen Analysen Einträge verloren.
   */
  private writeChain: Promise<unknown> = Promise.resolve();

  constructor(dataDir?: string) {
    // turbopackIgnore verhindert, dass der Bundler den dynamischen Pfad als
    // Modulreferenz interpretiert und das gesamte Projekt mit einbezieht.
    this.root = path.resolve(/* turbopackIgnore: true */ process.cwd(), dataDir ?? getConfig().storage.dataDir);
    this.analysesDir = path.join(this.root, "analyses");
    this.indexPath = path.join(this.root, "index.json");
  }

  async save(analysis: MarketAnalysis): Promise<void> {
    // Die Schreibseite braucht dieselbe Prüfung wie die Leseseite, und zwar
    // dringender: ein manipulierter Pfad liest hier nicht fremde Daten,
    // sondern überschreibt sie. Ein Fehlschlag ist lauter als ein
    // stillschweigend verworfener Speichervorgang – der verlöre die Analyse.
    if (!isSafeId(analysis.id)) {
      throw new Error(`Unzulässige Analyse-ID: ${JSON.stringify(analysis.id)}`);
    }

    await this.enqueue(async () => {
      await mkdir(this.analysesDir, { recursive: true });
      await writeFile(this.filePath(analysis.id), JSON.stringify(analysis, null, 2), "utf8");

      const index = await this.readIndex();
      // Ein erneutes Speichern derselben ID darf die Merkung nicht verwerfen.
      const previous = index.entries.find((e) => e.id === analysis.id);
      const summary = { ...toSummary(analysis), saved: previous?.saved ?? false };
      const entries = [summary, ...index.entries.filter((e) => e.id !== analysis.id)];
      await this.writeIndex({ version: 1, entries });

      this.log.debug("Analyse gespeichert", { id: analysis.id, term: analysis.query.term });
    });
  }

  async findById(id: string): Promise<MarketAnalysis | undefined> {
    if (!isSafeId(id)) return undefined;
    try {
      const raw = await readFile(this.filePath(id), "utf8");
      return JSON.parse(raw) as MarketAnalysis;
    } catch (error) {
      if (isNotFound(error)) return undefined;
      this.log.error("Analyse konnte nicht gelesen werden", { id, error: String(error) });
      return undefined;
    }
  }

  async findSummaryById(id: string): Promise<AnalysisSummary | undefined> {
    const index = await this.readIndex();
    return index.entries.find((entry) => entry.id === id);
  }

  async list(options: ListOptions = {}): Promise<AnalysisSummary[]> {
    const index = await this.readIndex();
    const term = options.term?.trim().toLowerCase();

    let entries = index.entries;
    if (options.savedOnly) entries = entries.filter((e) => e.saved);
    if (term) entries = entries.filter((e) => e.term.toLowerCase().includes(term));

    entries = [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const offset = options.offset ?? 0;
    const limit = options.limit ?? 50;
    return entries.slice(offset, offset + limit);
  }

  async findLatestByTerm(term: string, market: string): Promise<AnalysisSummary | undefined> {
    const normalized = term.trim().toLowerCase();
    const index = await this.readIndex();
    return index.entries
      .filter((e) => e.term.trim().toLowerCase() === normalized && e.market === market)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  }

  async setSaved(id: string, saved: boolean): Promise<AnalysisSummary | undefined> {
    return this.enqueue(async () => {
      const index = await this.readIndex();
      const entry = index.entries.find((e) => e.id === id);
      if (!entry) return undefined;

      const updated: AnalysisSummary = { ...entry, saved };
      await this.writeIndex({
        version: 1,
        entries: index.entries.map((e) => (e.id === id ? updated : e)),
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

  async count(): Promise<number> {
    const index = await this.readIndex();
    return index.entries.length;
  }

  /** Baut den Index aus den Einzeldateien neu auf. */
  async rebuildIndex(): Promise<number> {
    return this.enqueue(async () => {
      await mkdir(this.analysesDir, { recursive: true });
      const files = await readdir(this.analysesDir);
      const entries: AnalysisSummary[] = [];

      for (const file of files.filter((f) => f.endsWith(".json"))) {
        try {
          const raw = await readFile(path.join(this.analysesDir, file), "utf8");
          entries.push(toSummary(JSON.parse(raw) as MarketAnalysis));
        } catch {
          this.log.warn("Beschädigte Analysedatei übersprungen", { file });
        }
      }

      entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      await this.writeIndex({ version: 1, entries });
      return entries.length;
    });
  }

  // -------------------------------------------------------------------------

  private filePath(id: string): string {
    return path.join(this.analysesDir, `${id}.json`);
  }

  private async readIndex(): Promise<IndexFile> {
    try {
      const raw = await readFile(this.indexPath, "utf8");
      const parsed = JSON.parse(raw) as IndexFile;
      return Array.isArray(parsed.entries) ? parsed : EMPTY_INDEX;
    } catch (error) {
      if (isNotFound(error)) return EMPTY_INDEX;
      this.log.warn("Index unlesbar – wird als leer behandelt", { error: String(error) });
      return EMPTY_INDEX;
    }
  }

  private async writeIndex(index: IndexFile): Promise<void> {
    await mkdir(this.root, { recursive: true });

    // Atomar schreiben: erst vollständig daneben, dann in einem Zug an die
    // richtige Stelle. `rename` ersetzt die Zieldatei ohne Zwischenzustand –
    // ein Absturz hinterlässt entweder den alten oder den neuen Index, nie
    // einen halben und nie gar keinen.
    const tmp = `${this.indexPath}.tmp`;
    await writeFile(tmp, JSON.stringify(index, null, 2), "utf8");
    await rename(tmp, this.indexPath);
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.writeChain.then(operation, operation);
    // Fehler dürfen die Kette nicht unterbrechen.
    this.writeChain = result.catch(() => undefined);
    return result;
  }
}

// ---------------------------------------------------------------------------

export function toSummary(analysis: MarketAnalysis): AnalysisSummary {
  return {
    id: analysis.id,
    term: analysis.query.term,
    market: analysis.query.market ?? "DE",
    createdAt: analysis.createdAt,
    score: analysis.score.value,
    grade: analysis.score.grade,
    confidence: analysis.score.confidence,
    verdict: analysis.interpretation.verdict,
    trend: analysis.signals.demand?.direction ?? "stable",
    saved: false,
  };
}

/** Verhindert Pfad-Traversal über manipulierte IDs. */
function isSafeId(id: string): boolean {
  return /^[a-zA-Z0-9_-]{1,64}$/.test(id);
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
