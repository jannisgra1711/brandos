import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

/**
 * Modulaufloesung fuer den Node-Testrunner.
 *
 * Next.js loest zwei Dinge auf, die der nackte Node-Prozess nicht kennt:
 * den `@/`-Alias und TypeScript-Importe ohne Dateiendung. Ohne diesen Hook
 * muessten die Tests anders importieren als die Anwendung – und wuerden damit
 * etwas anderes pruefen als das, was ausgeliefert wird.
 */

const ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");
const SRC = path.join(ROOT, "src");
const EXTENSIONS = [".ts", ".tsx", ".mts", ".js", ".mjs"];

/** Sucht die tatsaechliche Datei zu einem endungslosen Pfad. */
function findFile(base) {
  if (existsSync(base) && path.extname(base)) return base;

  for (const ext of EXTENSIONS) {
    const candidate = base + ext;
    if (existsSync(candidate)) return candidate;
  }
  for (const ext of EXTENSIONS) {
    const candidate = path.join(base, `index${ext}`);
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

export function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const match = findFile(path.join(SRC, specifier.slice(2)));
    if (!match) throw new Error(`Alias konnte nicht aufgeloest werden: ${specifier}`);
    return nextResolve(pathToFileURL(match).href, context);
  }

  // Relative Importe ohne Endung – in TypeScript-Quellen der Normalfall.
  if (specifier.startsWith(".") && !path.extname(specifier) && context.parentURL) {
    const base = path.resolve(fileURLToPath(context.parentURL), "..", specifier);
    const match = findFile(base);
    if (match) return nextResolve(pathToFileURL(match).href, context);
  }

  return nextResolve(specifier, context);
}
