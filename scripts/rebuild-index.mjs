/**
 * Baut `.data/index.json` aus den Analysedateien neu auf.
 *
 * Der Index ist abgeleitet: jede Zusammenfassung darin steht vollstaendig auch
 * in `.data/analyses/<id>.json`. Geht er verloren oder wird er unlesbar, zeigt
 * die Historie eine leere Liste, obwohl auf der Platte alles liegt. Genau
 * dafuer existiert `rebuildIndex()` – es hatte bisher nur keinen Aufrufer.
 *
 * Reparatur ist eine Betreiberaufgabe, keine Funktion der Oberflaeche. Deshalb
 * ein Skript und kein Knopf: Ein Wiederaufbau ersetzt den Index als Ganzes und
 * soll nicht versehentlich ausloesbar sein.
 *
 *   npm run rebuild-index
 *
 * Die Merkungen ("gespeichert") stehen nur im Index. Was vom alten Index noch
 * lesbar ist, wird uebernommen; ist er ganz zerstoert, sind sie verloren – die
 * Analysen selbst nicht.
 *
 * **Nicht neben einem laufenden Dev-Server ausfuehren.** Beide schreiben denselben
 * Index, und eine gleichzeitig gespeicherte Analyse gewinnt oder verliert je
 * nach Reihenfolge.
 */

import { register } from "node:module";
import { pathToFileURL } from "node:url";

// Warnungen zu beschaedigten Dateien sind hier das eigentliche Ergebnis –
// anders als im Testlauf, der nur Fehlschlaege zeigen soll.
process.env.BRANDOS_LOG_LEVEL ??= "warn";

register("./alias-hooks.mjs", pathToFileURL(import.meta.filename));

const { JsonAnalysisRepository } = await import("@/server/repositories");

const repo = new JsonAnalysisRepository();
const before = await repo.count();

console.log(`Index enthaelt ${before} Eintraege. Lese die Analysedateien…`);

const after = await repo.rebuildIndex();

console.log(`✔ Index neu aufgebaut: ${after} Eintraege.`);

if (after > before) {
  console.log(`  ${after - before} Analysen nachgetragen, die der Index nicht kannte.`);
} else if (after < before) {
  // Der Index kannte Eintraege ohne Datei. Das ist kein Fehler des Wiederaufbaus,
  // sondern das, was er behebt – die Datei fehlt, der Verweis fuehrte ins Leere.
  console.log(`  ${before - after} Verweise entfernt, zu denen keine Datei mehr existiert.`);
} else {
  console.log("  Der Index war bereits vollstaendig.");
}
