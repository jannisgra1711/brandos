/** Kleine, seiteneffektfreie Rechenhelfer für die Domain-Schicht. */

export function clamp(value: number, min = 0, max = 100): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** Bildet `value` aus dem Bereich [from, to] linear auf [0, 100] ab. */
export function normalize(value: number, from: number, to: number): number {
  if (to === from) return 50;
  return clamp(((value - from) / (to - from)) * 100);
}

/** Wie `normalize`, nur invertiert – hohe Eingaben ergeben niedrige Scores. */
export function normalizeInverse(value: number, from: number, to: number): number {
  return 100 - normalize(value, from, to);
}

/** Logarithmische Normalisierung – geeignet für Volumina mit großer Spannweite. */
export function normalizeLog(value: number, from: number, to: number): number {
  const safe = Math.max(value, 1);
  return normalize(Math.log10(safe), Math.log10(Math.max(from, 1)), Math.log10(Math.max(to, 2)));
}

export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  return sorted[mid] ?? 0;
}

/**
 * Normalisierte Shannon-Entropie (0..1) einer Verteilung. 1 bedeutet
 * gleichmäßige Streuung, 0 vollständige Konzentration auf ein Element.
 */
export function normalizedEntropy(shares: readonly number[]): number {
  const positive = shares.filter((s) => s > 0);
  if (positive.length <= 1) return 0;
  const total = positive.reduce((sum, s) => sum + s, 0);
  if (total <= 0) return 0;
  const entropy = -positive.reduce((sum, s) => {
    const p = s / total;
    return sum + p * Math.log(p);
  }, 0);
  return entropy / Math.log(positive.length);
}

export function round(value: number, decimals = 0): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Prozentuale Veränderung zwischen zwei Werten (als Faktor, z. B. 0.24 = +24 %). */
export function pctChange(from: number, to: number): number {
  if (from === 0) return to === 0 ? 0 : 1;
  return (to - from) / Math.abs(from);
}
