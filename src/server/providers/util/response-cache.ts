import "server-only";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Antwort-Cache für Live-Provider.
 *
 * Anlass: Der Discovery-Scan bewertet rund vierzehn Kandidaten und fragt
 * dabei für jeden die Nachfrage ab. Ohne Cache ist das ein bezahlter
 * API-Aufruf pro Kandidat und Durchlauf – das Kontingent eines freien
 * Tarifs ist damit nach wenigen Seitenaufrufen aufgebraucht.
 *
 * Drei Schichten, in dieser Reihenfolge:
 *
 *   1. Laufende Abrufe – gleichzeitige Anfragen auf denselben Schlüssel
 *      teilen sich einen Aufruf. Genau der Fall beim parallelen Scan.
 *   2. Speicher – für alles innerhalb eines Prozesslebens.
 *   3. Platte – überlebt den Neustart. Im Entwicklungsbetrieb der
 *      entscheidende Teil: Next startet bei jeder Änderung neu, ein reiner
 *      Speicher-Cache wäre dabei jedes Mal leer.
 *
 * Auch Fehlschläge werden zwischengespeichert, aber nur die *stabilen*:
 * dass Google Trends zu einem Begriff nichts kennt, ist eine Eigenschaft
 * des Begriffs und ändert sich nicht in der nächsten Minute. Zeitüberschrei-
 * tungen, Ratenlimits und Schlüsselfehler werden nie gespeichert – sie
 * sagen nichts über die Anfrage aus, nur über den Moment.
 */

interface StoredOk<T> {
  kind: "ok";
  value: T;
  storedAt: number;
}

interface StoredError {
  kind: "error";
  message: string;
  storedAt: number;
}

type Stored<T> = StoredOk<T> | StoredError;

export interface ResponseCacheOptions {
  /** Unterverzeichnis auf der Platte – üblicherweise die Provider-ID. */
  namespace: string;
  /** Ablagedauer erfolgreicher Antworten. 0 schaltet den Cache ab. */
  ttlMs: number;
  /** Ablagedauer stabiler Fehlschläge. Standard: wie `ttlMs`. */
  errorTtlMs?: number;
  /** Basisverzeichnis, üblicherweise der Datastore. */
  dataDir: string;
  /**
   * Entscheidet, ob ein Fehlschlag eine Eigenschaft der Anfrage ist
   * (speicherbar) oder des Moments (nicht speicherbar).
   */
  isStableFailure?: (error: unknown) => boolean;
}

export class ProviderResponseCache<T> {
  private readonly namespace: string;
  private readonly ttlMs: number;
  private readonly errorTtlMs: number;
  private readonly dataDir: string;
  private readonly isStableFailure: (error: unknown) => boolean;

  private readonly memory = new Map<string, Stored<T>>();
  private readonly inflight = new Map<string, Promise<T>>();

  constructor(options: ResponseCacheOptions) {
    this.namespace = options.namespace;
    this.ttlMs = options.ttlMs;
    this.errorTtlMs = options.errorTtlMs ?? options.ttlMs;
    this.dataDir = options.dataDir;
    this.isStableFailure = options.isStableFailure ?? (() => false);
  }

  /**
   * Liefert die gespeicherte Antwort oder ruft `factory` auf.
   *
   * Ein gespeicherter Fehlschlag wird als Fehler *wiederholt* – der Aufrufer
   * sieht denselben Ablauf wie beim ersten Mal, nur ohne API-Aufruf.
   */
  async resolve(key: string, factory: () => Promise<T>): Promise<T> {
    if (this.ttlMs <= 0) return factory();

    const running = this.inflight.get(key);
    if (running) return running;

    const promise = this.load(key, factory).finally(() => {
      this.inflight.delete(key);
    });

    this.inflight.set(key, promise);
    return promise;
  }

  private async load(key: string, factory: () => Promise<T>): Promise<T> {
    const cached = this.memory.get(key) ?? (await this.readFromDisk(key));
    if (cached && this.isFresh(cached)) {
      this.memory.set(key, cached);
      if (cached.kind === "ok") return cached.value;
      throw new CachedFailure(cached.message);
    }

    try {
      const value = await factory();
      await this.store(key, { kind: "ok", value, storedAt: Date.now() });
      return value;
    } catch (error) {
      if (this.isStableFailure(error)) {
        const message = error instanceof Error ? error.message : String(error);
        await this.store(key, { kind: "error", message, storedAt: Date.now() });
      }
      throw error;
    }
  }

  private isFresh(entry: Stored<T>): boolean {
    const ttl = entry.kind === "ok" ? this.ttlMs : this.errorTtlMs;
    return Date.now() - entry.storedAt < ttl;
  }

  private async store(key: string, entry: Stored<T>): Promise<void> {
    this.memory.set(key, entry);
    const file = this.pathFor(key);
    try {
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, JSON.stringify(entry), "utf8");
    } catch {
      // Ein nicht schreibbarer Cache ist kein Grund, die Analyse scheitern
      // zu lassen – er kostet dann nur den nächsten Abruf.
    }
  }

  private async readFromDisk(key: string): Promise<Stored<T> | undefined> {
    try {
      const raw = await readFile(this.pathFor(key), "utf8");
      const parsed = JSON.parse(raw) as Stored<T>;
      // Beschädigte Einträge gelten als nicht vorhanden.
      if (parsed?.kind !== "ok" && parsed?.kind !== "error") return undefined;
      if (typeof parsed.storedAt !== "number") return undefined;
      return parsed;
    } catch {
      return undefined;
    }
  }

  private pathFor(key: string): string {
    // Der Schlüssel enthält freien Nutzertext – gehasht, damit daraus kein
    // Dateiname mit Pfadanteilen oder Sonderzeichen wird.
    const digest = createHash("sha1").update(key).digest("hex");
    return path.join(this.dataDir, "provider-cache", this.namespace, `${digest}.json`);
  }
}

/** Ein Fehlschlag, der aus dem Cache stammt statt aus einem echten Abruf. */
export class CachedFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CachedFailure";
  }
}
