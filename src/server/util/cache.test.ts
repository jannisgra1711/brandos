import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TtlCache } from "./cache";

/**
 * Der Discovery-Cache. Diese Datei ist zugleich der Nachweis, dass die
 * Klasse überhaupt aus einem Test heraus ladbar ist: Mit einer
 * TypeScript-Parameter-Property im Konstruktor brach der Lauf zuvor mit
 * ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX ab, bevor eine Zusicherung lief.
 *
 * Fachlich zählt vor allem die geteilte Berechnung – sie ist der Grund,
 * warum gleichzeitige Aufrufe der Discovery nur einen Durchlauf auslösen.
 */

describe("TtlCache", () => {
  it("liefert einen abgelegten Wert zurück", () => {
    const cache = new TtlCache<number>(60_000);
    cache.set("a", 42);
    assert.equal(cache.get("a"), 42);
  });

  it("kennt einen nie abgelegten Schlüssel nicht", () => {
    const cache = new TtlCache<number>(60_000);
    assert.equal(cache.get("a"), undefined);
  });

  it("vergisst einen Wert nach Ablauf der Frist", async () => {
    const cache = new TtlCache<number>(10);
    cache.set("a", 1);
    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.equal(cache.get("a"), undefined);
  });

  it("berechnet nur einmal, solange der Wert frisch ist", async () => {
    const cache = new TtlCache<string>(60_000);
    let calls = 0;
    const factory = async () => {
      calls += 1;
      return "wert";
    };

    assert.equal(await cache.resolve("a", factory), "wert");
    assert.equal(await cache.resolve("a", factory), "wert");
    assert.equal(calls, 1);
  });

  it("teilt eine laufende Berechnung unter gleichzeitigen Aufrufen", async () => {
    const cache = new TtlCache<string>(60_000);
    let calls = 0;
    const slow = async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return "fertig";
    };

    // Genau der Fall beim gleichzeitigen Aufruf der Discovery: ohne
    // geteilte Berechnung liefen hier drei vollständige Scans an.
    const results = await Promise.all([
      cache.resolve("a", slow),
      cache.resolve("a", slow),
      cache.resolve("a", slow),
    ]);

    assert.deepEqual(results, ["fertig", "fertig", "fertig"]);
    assert.equal(calls, 1);
  });

  it("merkt sich einen Fehlschlag nicht", async () => {
    const cache = new TtlCache<string>(60_000);
    let attempt = 0;
    const flaky = async () => {
      attempt += 1;
      if (attempt === 1) throw new Error("einmalig");
      return "endlich";
    };

    await assert.rejects(() => cache.resolve("a", flaky));
    // Ein gescheiterter Versuch darf den Schlüssel nicht blockieren.
    assert.equal(await cache.resolve("a", flaky), "endlich");
  });

  it("verwirft gezielt oder vollständig", async () => {
    const cache = new TtlCache<number>(60_000);
    cache.set("a", 1);
    cache.set("b", 2);

    cache.invalidate("a");
    assert.equal(cache.get("a"), undefined);
    assert.equal(cache.get("b"), 2);

    cache.invalidate();
    assert.equal(cache.get("b"), undefined);
  });
});
