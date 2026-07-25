import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createLimiter } from "./concurrency";

/**
 * Der Limiter verhindert, dass vierzehn gleichzeitige Discovery-Abrufe
 * dieselbe API überrennen. Entscheidend sind drei Eigenschaften: die Grenze
 * hält, es geht nichts verloren, und ein Fehlschlag blockiert die
 * Warteschlange nicht.
 */

/** Baut eine Aufgabe, die die tatsächliche Gleichzeitigkeit mitschreibt. */
function tracker() {
  let active = 0;
  let peak = 0;

  return {
    get peak() {
      return peak;
    },
    task: (value: number, delayMs = 5) => async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      active -= 1;
      return value;
    },
  };
}

describe("createLimiter", () => {
  it("überschreitet die Grenze nicht", async () => {
    const run = createLimiter(3);
    const observed = tracker();

    await Promise.all(Array.from({ length: 12 }, (_, i) => run(observed.task(i))));

    assert.ok(observed.peak <= 3, `Gleichzeitig liefen ${observed.peak}, erlaubt sind 3`);
  });

  it("führt alle Aufgaben aus und erhält ihre Ergebnisse", async () => {
    const run = createLimiter(2);
    const observed = tracker();

    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) => run(observed.task(i))),
    );

    assert.deepEqual(results, [0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("nutzt die Grenze tatsächlich aus", async () => {
    const run = createLimiter(4);
    const observed = tracker();

    await Promise.all(Array.from({ length: 10 }, (_, i) => run(observed.task(i, 10))));

    // Ohne echte Parallelität wäre der Höchststand 1 – dann wäre der
    // Limiter eine Warteschlange und keine Begrenzung.
    assert.equal(observed.peak, 4);
  });

  it("gibt den Platz auch nach einem Fehlschlag frei", async () => {
    const run = createLimiter(1);

    await assert.rejects(() =>
      run(async () => {
        throw new Error("kaputt");
      }),
    );

    // Wäre der Platz nicht freigegeben, liefe der nächste Aufruf ewig.
    assert.equal(await run(async () => "geht weiter"), "geht weiter");
  });

  it("behandelt eine Grenze unter 1 als 1", async () => {
    const run = createLimiter(0);
    const observed = tracker();

    await Promise.all(Array.from({ length: 4 }, (_, i) => run(observed.task(i))));

    assert.equal(observed.peak, 1);
  });
});
