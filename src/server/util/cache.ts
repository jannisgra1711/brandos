/**
 * Prozesslokaler Cache mit Ablaufzeit.
 *
 * Zweck: Discovery und Dashboard bewerten dieselben Kandidaten für alle
 * Nutzer. Ohne Cache würde jeder Seitenaufruf dieselben Provider erneut
 * befragen.
 *
 * Bewusst einfach gehalten – ein verteilter Cache (Redis) wäre erst nötig,
 * wenn mehrere Instanzen laufen. Die Schnittstelle ist so gewählt, dass der
 * Wechsel keine Aufrufstelle berührt.
 */

interface Entry<T> {
  value: T;
  expiresAt: number;
}

export class TtlCache<T> {
  private readonly entries = new Map<string, Entry<T>>();
  /** Laufende Berechnungen – verhindert paralleles Neuberechnen desselben Schlüssels. */
  private readonly inflight = new Map<string, Promise<T>>();

  // Feld ausgeschrieben statt als Parameter-Property: Letztere erzeugen
  // Laufzeitcode, den Nodes Type-Stripping nicht unterstützt. Der Testlauf
  // bräche mit ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX ab, sobald ein Test etwas
  // importiert, das diese Datei mitzieht.
  private readonly ttlMs: number;

  constructor(ttlMs: number) {
    this.ttlMs = ttlMs;
  }

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T): void {
    this.entries.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  /**
   * Liefert den Wert aus dem Cache oder berechnet ihn. Gleichzeitige Aufrufe
   * mit demselben Schlüssel teilen sich eine Berechnung.
   */
  async resolve(key: string, factory: () => Promise<T>): Promise<T> {
    const cached = this.get(key);
    if (cached !== undefined) return cached;

    const running = this.inflight.get(key);
    if (running) return running;

    const promise = factory()
      .then((value) => {
        this.set(key, value);
        return value;
      })
      .finally(() => {
        this.inflight.delete(key);
      });

    this.inflight.set(key, promise);
    return promise;
  }

  invalidate(key?: string): void {
    if (key) this.entries.delete(key);
    else this.entries.clear();
  }
}
