import "server-only";

/**
 * Begrenzt, wie viele Aufrufe gleichzeitig laufen dürfen.
 *
 * Anlass: Der Discovery-Scan startet alle Kandidaten parallel. Vierzehn
 * gleichzeitige Anfragen an dieselbe API laufen dort in eine Warteschlange,
 * die der Anbieter verwaltet – bei uns äußert sich das als Zeitüberschrei-
 * tung, obwohl die Anfrage selbst in Ordnung war. Gestaffelt kommen alle
 * durch; die Gesamtdauer bleibt nahezu gleich, weil die Wartezeit ohnehin
 * beim Anbieter entstand.
 *
 * Der Grenzwert gilt pro Limiter-Instanz, also üblicherweise pro Provider:
 * jede API hat ihre eigene Belastungsgrenze.
 */
export function createLimiter(maxConcurrent: number): <T>(task: () => Promise<T>) => Promise<T> {
  const limit = Math.max(1, maxConcurrent);
  const waiting: (() => void)[] = [];
  let active = 0;

  function release(): void {
    active -= 1;
    // Den nächsten Wartenden wecken. Reihenfolge ist FIFO, damit kein
    // Aufruf beliebig lange hinten ansteht.
    waiting.shift()?.();
  }

  return async function run<T>(task: () => Promise<T>): Promise<T> {
    if (active >= limit) {
      await new Promise<void>((resolve) => waiting.push(resolve));
    }
    active += 1;
    try {
      return await task();
    } finally {
      release();
    }
  };
}
