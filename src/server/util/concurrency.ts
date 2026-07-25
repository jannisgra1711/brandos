/**
 * Begrenzte Parallelität.
 *
 * Discovery bewertet Dutzende Kandidaten. Alle gleichzeitig zu starten würde
 * jede Datenquelle in ihr Ratenlimit treiben – nacheinander wäre zu langsam.
 * Diese Funktion hält ein festes Fenster offen.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const size = Math.max(1, Math.min(limit, items.length));
  const results = new Array<R>(items.length);
  let cursor = 0;

  const workers = Array.from({ length: size }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await mapper(items[index] as T, index);
    }
  });

  await Promise.all(workers);
  // Jeder Index wurde genau einmal beschrieben; die Lücken-Warnung des
  // Compilers lässt sich hier nicht anders auflösen.
  return results as R[];
}

type Settled<R> = { ok: true; value: R } | { ok: false; error: unknown };

/** Wie `mapWithConcurrency`, verwirft aber fehlgeschlagene Einträge. */
export async function mapSettled<T, R>(
  items: readonly T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const settled = await mapWithConcurrency<T, Settled<R>>(items, limit, async (item, index) => {
    try {
      return { ok: true, value: await mapper(item, index) };
    } catch (error) {
      return { ok: false, error };
    }
  });

  const values: R[] = [];
  for (const entry of settled) {
    if (entry.ok) values.push(entry.value);
  }
  return values;
}
