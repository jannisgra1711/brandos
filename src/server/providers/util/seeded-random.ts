/**
 * Deterministischer Zufall.
 *
 * Mock-Daten müssen reproduzierbar sein: dieselbe Suchanfrage soll bei jedem
 * Aufruf dasselbe Marktbild ergeben. Andernfalls wirkt das Produkt beliebig,
 * Snapshots lassen sich nicht testen und gespeicherte Analysen widersprechen
 * späteren Ansichten desselben Marktes.
 */

/** FNV-1a – schnell, gut gestreut, stabil über Prozessgrenzen hinweg. */
export function hashString(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export interface Rng {
  /** Gleichverteilt in [0, 1). */
  next(): number;
  /** Gleichverteilt in [min, max). */
  range(min: number, max: number): number;
  /** Ganzzahlig in [min, max]. */
  int(min: number, max: number): number;
  /** Normalverteilt um `mean` mit Standardabweichung `stdDev`. */
  gaussian(mean: number, stdDev: number): number;
  /** Zufälliges Element. */
  pick<T>(items: readonly T[]): T;
  /** `count` verschiedene Elemente in zufälliger Reihenfolge. */
  pickMany<T>(items: readonly T[], count: number): T[];
  /** true mit Wahrscheinlichkeit `probability`. */
  chance(probability: number): boolean;
}

/** Mulberry32 – kompakter PRNG mit guter Verteilung für diesen Zweck. */
export function createRng(seed: string | number): Rng {
  let state = (typeof seed === "string" ? hashString(seed) : seed) >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const range = (min: number, max: number): number => min + next() * (max - min);

  return {
    next,
    range,
    int: (min, max) => Math.floor(range(min, max + 1)),
    gaussian: (mean, stdDev) => {
      // Box-Muller, auf +/- 3 Sigma begrenzt, damit keine Ausreißer entstehen.
      const u1 = Math.max(next(), Number.EPSILON);
      const u2 = next();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      return mean + Math.max(-3, Math.min(3, z)) * stdDev;
    },
    pick: <T,>(items: readonly T[]): T => {
      if (items.length === 0) throw new Error("createRng().pick: leere Auswahlmenge");
      return items[Math.floor(next() * items.length)] as T;
    },
    pickMany: <T,>(items: readonly T[], count: number): T[] => {
      const pool = [...items];
      const result: T[] = [];
      const take = Math.min(count, pool.length);
      for (let i = 0; i < take; i += 1) {
        const index = Math.floor(next() * pool.length);
        result.push(...pool.splice(index, 1));
      }
      return result;
    },
    chance: (probability) => next() < probability,
  };
}

/** Normalisiert einen Suchbegriff zu einem stabilen Seed-Schlüssel. */
export function seedKey(...parts: (string | undefined)[]): string {
  return parts
    .filter((p): p is string => Boolean(p))
    .map((p) => p.trim().toLowerCase().replace(/\s+/g, " "))
    .join("::");
}
