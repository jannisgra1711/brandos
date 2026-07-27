import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { ProductProject } from "@/domain/types";
import { JsonProjectRepository } from "./json-project-repository";

/**
 * Ein Vorhaben unterscheidet sich von einer Analyse dadurch, dass es
 * **verändert** wird. Abgesichert wird deshalb vor allem, was dabei schiefgehen
 * kann:
 *
 *   1. Die Herkunft bleibt eingefroren, auch wenn jemand sie mitschickt.
 *   2. `updatedAt` bewegt sich, `createdAt` nicht.
 *   3. Die Übersicht sortiert nach Bearbeitung, nicht nach Entstehung.
 *   4. Verworfenes verschwindet aus der Arbeitsansicht, aber nicht von Platte.
 *   5. Eine manipulierte ID erreicht das Dateisystem nicht.
 */

let dir: string;
let repo: JsonProjectRepository;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "brandos-projects-"));
  repo = new JsonProjectRepository(dir);
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function project(overrides: Partial<ProductProject> = {}): ProductProject {
  return {
    id: "vorhaben-1",
    analysisId: "analyse-1",
    term: "Emaille Tasse",
    market: "DE",
    title: "Emaille-Tasse mit Namen",
    status: "idee",
    composition: {
      niche: "Emaille Tasse",
      productType: "Tasse",
      audience: "Geschenkkäufer im Umfeld",
      emotion: "Verbundenheit",
      style: "Minimal Mono",
      differentiator: "Personalisierung",
    },
    suggestedPriceRange: { min: 17, max: 24, currency: "EUR" },
    origin: {
      ideaId: "idee-1",
      score: 47.1,
      grade: "C",
      potential: 62,
      distinctiveness: 55,
    },
    createdAt: "2026-07-27T10:00:00.000Z",
    updatedAt: "2026-07-27T10:00:00.000Z",
    ...overrides,
  };
}

describe("JsonProjectRepository – Speichern und Lesen", () => {
  it("findet ein gespeichertes Vorhaben vollständig wieder", async () => {
    await repo.save(project());

    const found = await repo.findById("vorhaben-1");
    assert.equal(found?.title, "Emaille-Tasse mit Namen");
    assert.equal(found?.composition.productType, "Tasse");
    assert.equal(found?.origin.score, 47.1);
  });

  it("kennt eine nie gespeicherte ID nicht", async () => {
    assert.equal(await repo.findById("gibt-es-nicht"), undefined);
  });

  it("führt die Analyse-ID im Index mit", async () => {
    // Ohne sie müsste „schon übernommen?" jede Projektdatei einzeln lesen.
    await repo.save(project());
    const [entry] = await repo.list();
    assert.equal(entry?.analysisId, "analyse-1");
  });

  it("verliert bei parallelen Schreibzugriffen keinen Eintrag", async () => {
    await Promise.all(
      Array.from({ length: 12 }, (_, i) => repo.save(project({ id: `parallel-${i}` }))),
    );

    assert.equal(await repo.count(), 12);
  });
});

describe("JsonProjectRepository – Ändern", () => {
  beforeEach(async () => {
    await repo.save(project());
  });

  it("ändert Titel, Status und Notiz", async () => {
    const updated = await repo.update("vorhaben-1", {
      title: "Neuer Titel",
      status: "entwurf",
      notes: "Erste Skizze steht.",
    });

    assert.equal(updated?.title, "Neuer Titel");
    assert.equal(updated?.status, "entwurf");
    assert.equal(updated?.notes, "Erste Skizze steht.");
    assert.equal((await repo.findById("vorhaben-1"))?.status, "entwurf");
  });

  it("bewegt updatedAt, lässt createdAt stehen", async () => {
    const updated = await repo.update(
      "vorhaben-1",
      { status: "bereit" },
      new Date("2026-08-01T12:00:00.000Z"),
    );

    assert.equal(updated?.createdAt, "2026-07-27T10:00:00.000Z");
    assert.equal(updated?.updatedAt, "2026-08-01T12:00:00.000Z");
  });

  it("friert die Herkunft ein, auch wenn sie mitgeschickt wird", async () => {
    // `origin` beschreibt den Moment der Übernahme. Bewegte er sich mit, ginge
    // genau die Vergleichsgrundlage verloren, für die er existiert.
    const updated = await repo.update("vorhaben-1", {
      title: "Neu",
      ...({ origin: { ideaId: "x", score: 99, grade: "A", potential: 1, distinctiveness: 1 } } as object),
    });

    assert.equal(updated?.origin.score, 47.1);
    assert.equal(updated?.origin.ideaId, "idee-1");
  });

  it("lässt weder ID noch Analysebezug überschreiben", async () => {
    const updated = await repo.update("vorhaben-1", {
      ...({ id: "gekapert", analysisId: "fremd", createdAt: "2000-01-01T00:00:00.000Z" } as object),
      title: "Neu",
    });

    assert.equal(updated?.id, "vorhaben-1");
    assert.equal(updated?.analysisId, "analyse-1");
    assert.equal(updated?.createdAt, "2026-07-27T10:00:00.000Z");
  });

  it("meldet nichts zurück, wenn es das Vorhaben nicht gibt", async () => {
    assert.equal(await repo.update("gibt-es-nicht", { status: "bereit" }), undefined);
  });

  it("hält den Index mit der Datei gleich", async () => {
    await repo.update("vorhaben-1", { title: "Umbenannt", status: "bereit" });

    const [entry] = await repo.list();
    assert.equal(entry?.title, "Umbenannt");
    assert.equal(entry?.status, "bereit");
  });
});

describe("JsonProjectRepository – Übersicht", () => {
  beforeEach(async () => {
    await repo.save(project({ id: "alt", createdAt: "2026-07-01T00:00:00.000Z", updatedAt: "2026-07-01T00:00:00.000Z" }));
    await repo.save(project({ id: "neu", createdAt: "2026-07-05T00:00:00.000Z", updatedAt: "2026-07-05T00:00:00.000Z" }));
  });

  it("sortiert nach Bearbeitung, nicht nach Entstehung", async () => {
    // Das ältere Vorhaben wird angefasst und gehört danach nach oben.
    await repo.update("alt", { notes: "weitergedacht" }, new Date("2026-07-09T00:00:00.000Z"));

    assert.deepEqual((await repo.list()).map((e) => e.id), ["alt", "neu"]);
  });

  it("lässt Verworfenes aus der Arbeitsansicht heraus", async () => {
    await repo.update("alt", { status: "verworfen" });

    assert.deepEqual((await repo.list()).map((e) => e.id), ["neu"]);
    // Von Platte ist es nicht verschwunden – beiseitelegen ist nicht löschen.
    assert.equal((await repo.findById("alt"))?.status, "verworfen");
  });

  it("führt Verworfenes auf Wunsch mit", async () => {
    await repo.update("alt", { status: "verworfen" });
    assert.equal((await repo.list({ includeDiscarded: true })).length, 2);
  });

  it("filtert auf einen Status – auch auf den verworfenen", async () => {
    await repo.update("alt", { status: "verworfen" });
    assert.deepEqual((await repo.list({ status: "verworfen" })).map((e) => e.id), ["alt"]);
  });

  it("findet die Vorhaben zu einer Analyse", async () => {
    await repo.save(project({ id: "andere-analyse", analysisId: "analyse-2" }));

    assert.deepEqual(
      (await repo.listByAnalysis("analyse-1")).map((e) => e.id).sort(),
      ["alt", "neu"],
    );
    assert.deepEqual((await repo.listByAnalysis("analyse-2")).map((e) => e.id), ["andere-analyse"]);
  });

  it("blättert über limit und offset", async () => {
    assert.equal((await repo.list({ limit: 1 })).length, 1);
    assert.deepEqual((await repo.list({ limit: 1, offset: 1 })).map((e) => e.id), ["alt"]);
  });
});

describe("JsonProjectRepository – Löschen", () => {
  it("entfernt Datei und Indexeintrag", async () => {
    await repo.save(project());

    assert.equal(await repo.remove("vorhaben-1"), true);
    assert.equal(await repo.findById("vorhaben-1"), undefined);
    assert.equal(await repo.count(), 0);
  });

  it("meldet false für ein Vorhaben, das es nie gab", async () => {
    assert.equal(await repo.remove("gibt-es-nicht"), false);
  });
});

describe("JsonProjectRepository – Sicherheit", () => {
  it("blockiert eine manipulierte ID beim Schreiben", async () => {
    await assert.rejects(
      () => repo.save(project({ id: "../../entwischt" })),
      /Unzulässige Vorhaben-ID/,
    );
  });

  it("blockiert eine manipulierte ID beim Lesen, Ändern und Löschen", async () => {
    assert.equal(await repo.findById("../../etc/passwd"), undefined);
    assert.equal(await repo.update("../../etc/passwd", { status: "bereit" }), undefined);
    assert.equal(await repo.remove("../../etc/passwd"), false);
    assert.deepEqual(await repo.listByAnalysis("../../etc/passwd"), []);
  });

  it("schreibt keine temporären Dateien fest", async () => {
    await repo.save(project());
    const raw = await readFile(path.join(dir, "projects-index.json"), "utf8");
    assert.equal(JSON.parse(raw).entries.length, 1);
  });
});
