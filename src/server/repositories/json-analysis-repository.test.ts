import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { MarketAnalysis } from "@/domain/types";
import { JsonAnalysisRepository } from "./json-analysis-repository";

/**
 * Die Persistenz ist die einzige Stelle, an der Daten des Nutzers verloren
 * gehen können. Abgesichert werden die vier Zusagen, auf denen sie beruht:
 *
 *   1. Was gespeichert wurde, ist wiederfindbar – vollständig und kompakt.
 *   2. Der Index bleibt mit den Dateien konsistent, auch bei parallelen
 *      Schreibzugriffen und beim Überschreiben derselben Analyse.
 *   3. Die Merkung (`saved`) überlebt ein erneutes Speichern.
 *   4. Eine manipulierte ID erreicht das Dateisystem nicht.
 */

let dir: string;
let repo: JsonAnalysisRepository;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "brandos-repo-"));
  repo = new JsonAnalysisRepository(dir);
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function analysis(overrides: Partial<MarketAnalysis> = {}): MarketAnalysis {
  const id = overrides.id ?? "analyse-1";
  return {
    id,
    query: { term: "Emaille Tasse", market: "DE" },
    createdAt: "2026-07-25T10:00:00.000Z",
    durationMs: 800,
    signals: {
      query: { term: "Emaille Tasse", market: "DE" },
      collectedAt: "2026-07-25T10:00:00.000Z",
      sources: [],
      keywords: [],
      productTypes: [],
      demand: {
        volumeIndex: 60,
        growth90d: 0.1,
        growth12m: 0.2,
        direction: "rising",
        series: [],
      },
      dataQuality: {
        coverage: 1,
        sourceCount: 3,
        syntheticShare: 0,
        confidence: 0.8,
        freshnessDays: 1,
      },
    },
    score: {
      value: 61.4,
      grade: "B",
      confidence: 0.73,
      factors: [],
      drivers: [],
      drags: [],
    },
    interpretation: {
      summary: "Zusammenfassung",
      verdict: "Tragfähiger Markt",
      insights: [],
      opportunities: [],
      risks: [],
      recommendedActions: [],
      ideas: [],
      producedBy: { analyst: "heuristic", degraded: true },
    },
    ...overrides,
  };
}

/** Liest den Index roh von der Platte – ohne den Umweg über das Repository. */
async function rawIndex(): Promise<{ entries: { id: string; saved: boolean }[] }> {
  const raw = await readFile(path.join(dir, "index.json"), "utf8");
  return JSON.parse(raw) as { entries: { id: string; saved: boolean }[] };
}

describe("JsonAnalysisRepository – Speichern und Finden", () => {
  it("findet eine gespeicherte Analyse vollständig wieder", async () => {
    await repo.save(analysis());
    const found = await repo.findById("analyse-1");

    assert.equal(found?.id, "analyse-1");
    assert.equal(found?.query.term, "Emaille Tasse");
    assert.equal(found?.score.value, 61.4);
  });

  it("liefert die kompakte Form ohne die vollständige Analyse", async () => {
    await repo.save(analysis());
    const summary = await repo.findSummaryById("analyse-1");

    assert.equal(summary?.term, "Emaille Tasse");
    assert.equal(summary?.grade, "B");
    assert.equal(summary?.trend, "rising");
    // Frisch gespeichert ist nichts gemerkt.
    assert.equal(summary?.saved, false);
  });

  it("gibt für unbekannte IDs nichts zurück, statt zu scheitern", async () => {
    assert.equal(await repo.findById("gibt-es-nicht"), undefined);
    assert.equal(await repo.findSummaryById("gibt-es-nicht"), undefined);
    assert.equal(await repo.count(), 0);
  });

  it("zählt gespeicherte Analysen", async () => {
    await repo.save(analysis({ id: "a" }));
    await repo.save(analysis({ id: "b" }));
    assert.equal(await repo.count(), 2);
  });
});

describe("JsonAnalysisRepository – Index-Konsistenz", () => {
  it("hält Index und Dateien beim Überschreiben deckungsgleich", async () => {
    await repo.save(analysis({ id: "a" }));
    await repo.save(analysis({ id: "a", durationMs: 999 }));

    const index = await rawIndex();
    // Zwei Speichervorgänge derselben ID ergeben genau einen Eintrag.
    assert.equal(index.entries.filter((e) => e.id === "a").length, 1);
    assert.equal(await repo.count(), 1);
    assert.equal((await repo.findById("a"))?.durationMs, 999);
  });

  it("verliert bei parallelen Schreibzugriffen keinen Eintrag", async () => {
    // Genau der Fall, für den die Schreibkette existiert: Lesen und
    // Schreiben des Index sind durch ein `await` getrennt.
    await Promise.all(
      Array.from({ length: 12 }, (_, i) => repo.save(analysis({ id: `parallel-${i}` }))),
    );

    assert.equal(await repo.count(), 12);
    const index = await rawIndex();
    assert.equal(new Set(index.entries.map((e) => e.id)).size, 12);
  });

  it("behandelt einen beschädigten Index als leer, statt zu scheitern", async () => {
    await repo.save(analysis());
    await writeFile(path.join(dir, "index.json"), "{kein json", "utf8");

    assert.deepEqual(await repo.list(), []);
    // Die Analysedatei selbst ist unversehrt.
    assert.equal((await repo.findById("analyse-1"))?.id, "analyse-1");
  });

  it("stellt den Index aus den Einzeldateien wieder her", async () => {
    await repo.save(analysis({ id: "a" }));
    await repo.save(analysis({ id: "b" }));
    await writeFile(path.join(dir, "index.json"), "{kein json", "utf8");

    const restored = await repo.rebuildIndex();
    assert.equal(restored, 2);
    assert.equal(await repo.count(), 2);
  });

  it("rettet die Merkungen über den Wiederaufbau", async () => {
    // Die Merkung steht nur im Index. Ein Wiederaufbau, der allein die
    // Analysedateien liest, setzte sie zurück – der Nutzer verlöre seine
    // Auswahl, obwohl er nur einen fehlenden Eintrag nachtragen wollte.
    await repo.save(analysis({ id: "gemerkt" }));
    await repo.save(analysis({ id: "nebenbei" }));
    await repo.setSaved("gemerkt", true);

    await repo.rebuildIndex();

    assert.equal((await repo.findSummaryById("gemerkt"))?.saved, true);
    assert.equal((await repo.findSummaryById("nebenbei"))?.saved, false);
  });

  it("überspringt beschädigte Analysedateien beim Wiederaufbau", async () => {
    await repo.save(analysis({ id: "heil" }));
    await writeFile(path.join(dir, "analyses", "kaputt.json"), "{kein json", "utf8");

    assert.equal(await repo.rebuildIndex(), 1);
  });

  it("hinterlässt keine temporären Dateien", async () => {
    await repo.save(analysis());
    const files = await readdir(dir);
    assert.ok(
      !files.some((f) => f.endsWith(".tmp")),
      `übrig geblieben: ${files.join(", ")}`,
    );
  });
});

describe("JsonAnalysisRepository – Merkung", () => {
  it("setzt und entfernt die Merkung", async () => {
    await repo.save(analysis());

    const marked = await repo.setSaved("analyse-1", true);
    assert.equal(marked?.saved, true);
    assert.equal((await repo.findSummaryById("analyse-1"))?.saved, true);

    await repo.setSaved("analyse-1", false);
    assert.equal((await repo.findSummaryById("analyse-1"))?.saved, false);
  });

  it("erhält die Merkung, wenn dieselbe Analyse erneut gespeichert wird", async () => {
    await repo.save(analysis({ id: "a" }));
    await repo.setSaved("a", true);

    // Erneutes Speichern – etwa nach einer Neuberechnung.
    await repo.save(analysis({ id: "a", durationMs: 1234 }));

    const summary = await repo.findSummaryById("a");
    assert.equal(summary?.saved, true, "eine Merkung des Nutzers darf nicht verloren gehen");
  });

  it("meldet eine unbekannte ID, statt einen Eintrag zu erfinden", async () => {
    assert.equal(await repo.setSaved("gibt-es-nicht", true), undefined);
    assert.equal(await repo.count(), 0);
  });
});

describe("JsonAnalysisRepository – Listen", () => {
  beforeEach(async () => {
    await repo.save(
      analysis({ id: "alt", createdAt: "2026-07-01T10:00:00.000Z", query: { term: "Camping", market: "DE" } }),
    );
    await repo.save(
      analysis({ id: "neu", createdAt: "2026-07-20T10:00:00.000Z", query: { term: "Emaille Tasse", market: "DE" } }),
    );
    await repo.save(
      analysis({ id: "mittel", createdAt: "2026-07-10T10:00:00.000Z", query: { term: "Emaille Becher", market: "AT" } }),
    );
  });

  it("liefert die neueste Analyse zuerst", async () => {
    const list = await repo.list();
    assert.deepEqual(list.map((e) => e.id), ["neu", "mittel", "alt"]);
  });

  it("filtert nach Begriff, unabhängig von der Schreibweise", async () => {
    const list = await repo.list({ term: "emaille" });
    assert.deepEqual(list.map((e) => e.id).sort(), ["mittel", "neu"]);
  });

  it("filtert auf gemerkte Analysen", async () => {
    await repo.setSaved("alt", true);
    const list = await repo.list({ savedOnly: true });
    assert.deepEqual(list.map((e) => e.id), ["alt"]);
  });

  it("blättert über limit und offset", async () => {
    assert.deepEqual((await repo.list({ limit: 2 })).map((e) => e.id), ["neu", "mittel"]);
    assert.deepEqual((await repo.list({ limit: 2, offset: 2 })).map((e) => e.id), ["alt"]);
  });

  it("findet die letzte Analyse eines Begriffs im richtigen Markt", async () => {
    const latest = await repo.findLatestByTerm("Emaille Tasse", "DE");
    assert.equal(latest?.id, "neu");

    // Derselbe Begriff in einem anderen Markt ist eine andere Analyse.
    assert.equal(await repo.findLatestByTerm("Emaille Tasse", "AT"), undefined);
  });
});

describe("JsonAnalysisRepository – Löschen", () => {
  it("entfernt Datei und Indexeintrag", async () => {
    await repo.save(analysis());

    assert.equal(await repo.remove("analyse-1"), true);
    assert.equal(await repo.findById("analyse-1"), undefined);
    assert.equal(await repo.count(), 0);

    const files = await readdir(path.join(dir, "analyses"));
    assert.deepEqual(files, []);
  });

  it("meldet das Löschen einer unbekannten Analyse als wirkungslos", async () => {
    assert.equal(await repo.remove("gibt-es-nicht"), false);
  });
});

describe("JsonAnalysisRepository – Pfad-Traversal", () => {
  const HOSTILE = ["../../flucht", "..\\..\\flucht", "a/b", "mit punkt.", "", "x".repeat(80)];

  it("liest keine Datei außerhalb des Datenverzeichnisses", async () => {
    for (const id of HOSTILE) {
      assert.equal(await repo.findById(id), undefined, `durchgelassen: "${id}"`);
    }
  });

  it("löscht keine Datei außerhalb des Datenverzeichnisses", async () => {
    for (const id of HOSTILE) {
      assert.equal(await repo.remove(id), false, `durchgelassen: "${id}"`);
    }
  });

  it("schreibt keine Datei außerhalb des Datenverzeichnisses", async () => {
    // Die Schreibseite ist die gefährlichere: Lesen liefert höchstens
    // fremde Daten, Schreiben überschreibt sie.
    // `<dir>/analyses/../../entkommen.json` läge eine Ebene über `<dir>`.
    await assert.rejects(
      () => repo.save(analysis({ id: "../../entkommen" })),
      /Unzulässige Analyse-ID/,
    );

    const outside = path.resolve(dir, "..", "entkommen.json");
    let escaped = true;
    try {
      await readFile(outside, "utf8");
    } catch {
      escaped = false;
    }
    await rm(outside, { force: true });

    assert.equal(escaped, false, "eine manipulierte ID hat das Datenverzeichnis verlassen");
  });

  it("lehnt jede unzulässige ID beim Speichern ab", async () => {
    for (const id of HOSTILE) {
      await assert.rejects(
        () => repo.save(analysis({ id })),
        /Unzulässige Analyse-ID/,
        `durchgelassen: "${id}"`,
      );
    }
    // Und hinterlässt dabei keinen halben Zustand.
    assert.equal(await repo.count(), 0);
  });
});
