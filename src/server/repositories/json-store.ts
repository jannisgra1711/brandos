import "server-only";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Gemeinsames Handwerkszeug der dateibasierten Repositories.
 *
 * Hier steht nur, was mehr als ein Repository braucht **und** wo Korrektheit
 * sitzt: die Serialisierung von Schreibzugriffen und das atomare Ersetzen einer
 * Datei. Beides zweimal zu pflegen hiesse, zwei Gelegenheiten zu haben, es
 * unterschiedlich falsch zu machen.
 *
 * Die Form des Index bleibt bewusst bei den Repositories – ein Analyse-Index
 * und ein Vorhaben-Index haben verschiedene Einträge und verschiedene
 * Sortierungen. Eine Abstraktion darüber wäre eine Datenbank, und die ist
 * ausdrücklich nicht das Ziel.
 */

/**
 * Verhindert Pfad-Traversal über manipulierte IDs.
 *
 * Gilt für Lesen, Löschen **und** Schreiben: Ein manipulierter Pfad liest beim
 * Schreiben nicht fremde Daten, sondern überschreibt sie.
 */
export function isSafeId(id: string): boolean {
  return /^[a-zA-Z0-9_-]{1,64}$/.test(id);
}

export function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

/**
 * Schreibt vollständig daneben und ersetzt dann in einem Zug.
 *
 * `rename` tauscht die Zieldatei ohne Zwischenzustand – ein Absturz hinterlässt
 * entweder die alte oder die neue Fassung, nie eine halbe und nie gar keine.
 */
export async function writeAtomic(file: string, contents: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await writeFile(tmp, contents, "utf8");
  await rename(tmp, file);
}

/**
 * Serialisiert Schreibzugriffe.
 *
 * Node ist single-threaded, aber ein `await` zwischen Lesen und Schreiben des
 * Index erlaubt Verschränkung – ohne diese Kette gehen bei parallelen Zugriffen
 * Einträge verloren.
 */
export function createWriteChain(): <T>(operation: () => Promise<T>) => Promise<T> {
  let chain: Promise<unknown> = Promise.resolve();

  return <T>(operation: () => Promise<T>): Promise<T> => {
    // Beide Zweige führen die Operation aus: Ein Fehlschlag des Vorgängers darf
    // den Nachfolger nicht überspringen.
    const result = chain.then(operation, operation);
    chain = result.catch(() => undefined);
    return result;
  };
}
