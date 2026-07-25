import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { CachedFailure, ProviderResponseCache } from "./response-cache";

/**
 * Der Cache existiert aus einem konkreten Grund: Ohne ihn kostet jeder
 * Discovery-Durchlauf einen bezahlten API-Aufruf je Kandidat. Diese Tests
 * sichern die vier Zusagen ab, auf denen das beruht:
 *
 *   1. Was einmal geholt wurde, wird nicht erneut geholt.
 *   2. Gleichzeitige Anfragen auf denselben Schlüssel teilen einen Abruf.
 *   3. Der Cache überlebt den Prozess – sonst wäre er im Dev-Betrieb wertlos.
 *   4. Gespeichert werden nur Fehlschläge, die eine Eigenschaft der Anfrage
 *      sind. Ein Ratenlimit darf sich nicht in den Cache brennen.
 */

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "brandos-cache-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function cache(overrides: Partial<ConstructorParameters<typeof ProviderResponseCache>[0]> = {}) {
  return new ProviderResponseCache<string>({
    namespace: "test",
    ttlMs: 60_000,
    dataDir: dir,
    ...overrides,
  });
}

/** Zählt die Aufrufe und liefert bei jedem einen anderen Wert. */
function counter(prefix = "wert") {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    factory: async () => {
      calls += 1;
      return `${prefix}-${calls}`;
    },
  };
}

describe("ProviderResponseCache – Wiederverwendung", () => {
  it("holt denselben Schlüssel nur einmal", async () => {
    const subject = cache();
    const source = counter();

    assert.equal(await subject.resolve("a", source.factory), "wert-1");
    assert.equal(await subject.resolve("a", source.factory), "wert-1");
    assert.equal(source.calls, 1);
  });

  it("trennt verschiedene Schlüssel", async () => {
    const subject = cache();
    const source = counter();

    await subject.resolve("a", source.factory);
    await subject.resolve("b", source.factory);
    assert.equal(source.calls, 2);
  });

  it("teilt gleichzeitige Anfragen auf denselben Schlüssel", async () => {
    const subject = cache();
    let calls = 0;
    const slow = async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return "fertig";
    };

    // Genau der Fall beim parallelen Discovery-Scan.
    const results = await Promise.all([
      subject.resolve("a", slow),
      subject.resolve("a", slow),
      subject.resolve("a", slow),
    ]);

    assert.deepEqual(results, ["fertig", "fertig", "fertig"]);
    assert.equal(calls, 1);
  });

  it("holt nach Ablauf der Frist erneut", async () => {
    const subject = cache({ ttlMs: 10 });
    const source = counter();

    await subject.resolve("a", source.factory);
    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.equal(await subject.resolve("a", source.factory), "wert-2");
    assert.equal(source.calls, 2);
  });

  it("ist mit ttlMs 0 vollständig abgeschaltet", async () => {
    const subject = cache({ ttlMs: 0 });
    const source = counter();

    await subject.resolve("a", source.factory);
    await subject.resolve("a", source.factory);
    assert.equal(source.calls, 2);
  });
});

describe("ProviderResponseCache – Persistenz", () => {
  it("überlebt den Neustart des Prozesses", async () => {
    const source = counter();
    await cache().resolve("a", source.factory);

    // Neue Instanz, leerer Speicher, gleiches Verzeichnis – so verhält sich
    // ein Neustart des Dev-Servers.
    const restarted = cache();
    assert.equal(await restarted.resolve("a", source.factory), "wert-1");
    assert.equal(source.calls, 1);
  });

  it("behandelt eine beschädigte Datei als nicht vorhanden", async () => {
    const subject = cache();
    const source = counter();
    await subject.resolve("a", source.factory);

    // Alle abgelegten Dateien unbrauchbar machen.
    const { readdir } = await import("node:fs/promises");
    const nested = path.join(dir, "provider-cache", "test");
    for (const file of await readdir(nested)) {
      await writeFile(path.join(nested, file), "{kein json", "utf8");
    }

    const restarted = cache();
    assert.equal(await restarted.resolve("a", source.factory), "wert-2");
  });

  it("legt keine Schlüssel als Dateinamen ab", async () => {
    const subject = cache();
    await subject.resolve("../../flucht|DE|24", async () => "ok");

    const { readdir } = await import("node:fs/promises");
    const nested = path.join(dir, "provider-cache", "test");
    const files = await readdir(nested);

    assert.equal(files.length, 1);
    assert.match(files[0] ?? "", /^[0-9a-f]{40}\.json$/);
  });
});

describe("ProviderResponseCache – Fehlschläge", () => {
  class Stable extends Error {}
  class Transient extends Error {}

  const options = { isStableFailure: (error: unknown) => error instanceof Stable };

  it("speichert stabile Fehlschläge und wiederholt sie ohne Abruf", async () => {
    const subject = cache(options);
    let calls = 0;
    const failing = async (): Promise<string> => {
      calls += 1;
      throw new Stable("kennt den Begriff nicht");
    };

    await assert.rejects(() => subject.resolve("a", failing), Stable);
    // Zweiter Aufruf: gleicher Ausgang, aber aus dem Cache.
    await assert.rejects(() => subject.resolve("a", failing), CachedFailure);
    assert.equal(calls, 1);
  });

  it("erhält die Meldung eines gespeicherten Fehlschlags", async () => {
    const subject = cache(options);
    const failing = async (): Promise<string> => {
      throw new Stable("kennt den Begriff nicht");
    };

    await assert.rejects(() => subject.resolve("a", failing));
    await assert.rejects(() => subject.resolve("a", failing), /kennt den Begriff nicht/);
  });

  it("speichert vorübergehende Fehlschläge nicht", async () => {
    const subject = cache(options);
    let calls = 0;
    const failing = async (): Promise<string> => {
      calls += 1;
      throw new Transient("Ratenlimit");
    };

    await assert.rejects(() => subject.resolve("a", failing));
    await assert.rejects(() => subject.resolve("a", failing));
    // Ein Ratenlimit darf sich nicht einbrennen – sonst bliebe der Begriff
    // bis zum Ablauf der Frist tot, obwohl er längst wieder ginge.
    assert.equal(calls, 2);
  });

  it("liefert nach einem Fehlschlag wieder Ergebnisse, sobald der Abruf gelingt", async () => {
    const subject = cache(options);
    let attempt = 0;
    const flaky = async (): Promise<string> => {
      attempt += 1;
      if (attempt === 1) throw new Transient("einmalig");
      return "endlich";
    };

    await assert.rejects(() => subject.resolve("a", flaky));
    assert.equal(await subject.resolve("a", flaky), "endlich");
  });

  it("hält Fehlschläge über eine eigene Frist", async () => {
    const subject = cache({ ...options, ttlMs: 60_000, errorTtlMs: 10 });
    let calls = 0;
    const failing = async (): Promise<string> => {
      calls += 1;
      throw new Stable("kennt den Begriff nicht");
    };

    await assert.rejects(() => subject.resolve("a", failing));
    await new Promise((resolve) => setTimeout(resolve, 25));
    await assert.rejects(() => subject.resolve("a", failing));
    assert.equal(calls, 2);
  });
});
