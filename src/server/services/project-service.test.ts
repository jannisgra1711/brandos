import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { MarketAnalysis, ProductIdea } from "@/domain/types";
import {
  JsonAnalysisRepository,
  JsonProjectRepository,
  setAnalysisRepository,
  setProjectRepository,
} from "@/server/repositories";
import {
  createProjectFromIdea,
  editListing,
  generateListing,
  getProject,
  listProjects,
  updateProject,
} from "./project-service";

/**
 * Die Übernahme ist der Übergang von Erkenntnis zu Arbeit. Abgesichert wird,
 * was dabei mitgehen muss und was nicht:
 *
 *   1. Begriff und Markt reisen mit – das Vorhaben überlebt die Analyse.
 *   2. Die Marktdaten reisen *nicht* mit; es bleibt bei der Referenz.
 *   3. Score und Ideenwerte werden als Entscheidungsgrundlage eingefroren.
 *   4. Eine Idee, die es in dieser Analyse nicht gibt, wird nicht übernommen.
 */

let dir: string;

const IDEA: ProductIdea = {
  id: "idee-1",
  title: "Emaille-Tasse mit Namen – für Geschenkkäufer",
  composition: {
    niche: "Emaille Tasse",
    productType: "Tasse",
    audience: "Geschenkkäufer im Umfeld",
    emotion: "Verbundenheit",
    style: "Minimal Mono",
    differentiator: "Personalisierung",
  },
  rationale: "Geschenkmarkt mit hoher emotionaler Bindung.",
  potential: 62,
  distinctiveness: 55,
  suggestedPriceRange: { min: 17, max: 24, currency: "EUR" },
  risks: [],
};

function analysis(overrides: Partial<MarketAnalysis> = {}): MarketAnalysis {
  return {
    id: "analyse-1",
    query: { term: "Emaille Tasse", market: "DE" },
    createdAt: "2026-07-27T10:00:00.000Z",
    durationMs: 900,
    signals: {
      query: { term: "Emaille Tasse", market: "DE" },
      collectedAt: "2026-07-27T10:00:00.000Z",
      sources: [],
      keywords: [],
      productTypes: [],
      dataQuality: {
        coverage: 0.8,
        sourceCount: 3,
        syntheticShare: 0.5,
        confidence: 0.74,
        freshnessDays: 0,
      },
    },
    score: {
      value: 47.1,
      grade: "C",
      confidence: 0.74,
      factors: [],
      drivers: [],
      drags: [],
    },
    interpretation: {
      summary: "",
      verdict: "",
      insights: [],
      opportunities: [],
      risks: [],
      recommendedActions: [],
      ideas: [IDEA],
      producedBy: { analyst: "heuristic", degraded: false },
    },
    ...overrides,
  };
}

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "brandos-service-"));
  setAnalysisRepository(new JsonAnalysisRepository(dir));
  setProjectRepository(new JsonProjectRepository(dir));
});

afterEach(async () => {
  setAnalysisRepository(undefined);
  setProjectRepository(undefined);
  await rm(dir, { recursive: true, force: true });
});

describe("createProjectFromIdea", () => {
  beforeEach(async () => {
    const { getAnalysisRepository } = await import("@/server/repositories");
    await getAnalysisRepository().save(analysis());
  });

  it("übernimmt die Bausteine der Idee", async () => {
    const project = await createProjectFromIdea({ analysisId: "analyse-1", ideaId: "idee-1" });

    assert.notEqual(typeof project, "string");
    if (typeof project === "string") return;

    assert.equal(project.title, IDEA.title);
    assert.deepEqual(project.composition, IDEA.composition);
    assert.deepEqual(project.suggestedPriceRange, IDEA.suggestedPriceRange);
    assert.equal(project.status, "idee");
  });

  it("führt Begriff und Markt mit, damit das Vorhaben die Analyse überlebt", async () => {
    const project = await createProjectFromIdea({ analysisId: "analyse-1", ideaId: "idee-1" });
    if (typeof project === "string") throw new Error(project);

    assert.equal(project.term, "Emaille Tasse");
    assert.equal(project.market, "DE");

    // Die Analyse verschwindet – das Vorhaben bleibt aussagefähig.
    const { getAnalysisRepository } = await import("@/server/repositories");
    await getAnalysisRepository().remove("analyse-1");

    const found = await getProject(project.id);
    assert.equal(found?.term, "Emaille Tasse");
    assert.equal(found?.analysisId, "analyse-1");
  });

  it("friert Score und Ideenwerte als Entscheidungsgrundlage ein", async () => {
    const project = await createProjectFromIdea({ analysisId: "analyse-1", ideaId: "idee-1" });
    if (typeof project === "string") throw new Error(project);

    assert.equal(project.origin.score, 47.1);
    assert.equal(project.origin.grade, "C");
    assert.equal(project.origin.potential, 62);
    assert.equal(project.origin.distinctiveness, 55);
    assert.equal(project.origin.ideaId, "idee-1");
  });

  it("kopiert keine Marktdaten", async () => {
    const project = await createProjectFromIdea({ analysisId: "analyse-1", ideaId: "idee-1" });
    if (typeof project === "string") throw new Error(project);

    // Eingefrorene Signale würden stillschweigend veralten. Es bleibt bei der
    // Referenz – deshalb darf hier nichts aus `signals` auftauchen.
    assert.equal("signals" in project, false);
    assert.equal("score" in project, false);
  });

  it("nimmt einen eigenen Titel entgegen", async () => {
    const project = await createProjectFromIdea({
      analysisId: "analyse-1",
      ideaId: "idee-1",
      title: "  Namenstasse Edition 1  ",
    });
    if (typeof project === "string") throw new Error(project);

    assert.equal(project.title, "Namenstasse Edition 1");
  });

  it("unterscheidet fehlende Analyse von fehlender Idee", async () => {
    assert.equal(
      await createProjectFromIdea({ analysisId: "gibt-es-nicht", ideaId: "idee-1" }),
      "analysis-not-found",
    );
    assert.equal(
      await createProjectFromIdea({ analysisId: "analyse-1", ideaId: "gibt-es-nicht" }),
      "idea-not-found",
    );
  });

  it("erlaubt mehrere Vorhaben aus derselben Idee", async () => {
    // Zwei Varianten desselben Einfalls sind ein normaler Vorgang, kein Fehler.
    const a = await createProjectFromIdea({ analysisId: "analyse-1", ideaId: "idee-1" });
    const b = await createProjectFromIdea({ analysisId: "analyse-1", ideaId: "idee-1" });
    if (typeof a === "string" || typeof b === "string") throw new Error("nicht angelegt");

    assert.notEqual(a.id, b.id);
    assert.equal((await listProjects()).length, 2);
  });
});

describe("generateListing", () => {
  beforeEach(async () => {
    const { getAnalysisRepository } = await import("@/server/repositories");
    await getAnalysisRepository().save(analysis());
  });

  async function withProject() {
    const project = await createProjectFromIdea({ analysisId: "analyse-1", ideaId: "idee-1" });
    if (typeof project === "string") throw new Error(project);
    return project;
  }

  it("legt den Entwurf am Vorhaben ab", async () => {
    const project = await withProject();
    const updated = await generateListing(project.id);

    assert.ok(updated?.listing, "kein Entwurf entstanden");
    assert.ok(updated.listing.title.length > 0);
    assert.ok(updated.listing.tags.length > 0);
  });

  it("erzeugt auch dann einen Entwurf, wenn die Analyse gelöscht wurde", async () => {
    const project = await withProject();
    const { getAnalysisRepository } = await import("@/server/repositories");
    await getAnalysisRepository().remove("analyse-1");

    const updated = await generateListing(project.id);

    assert.ok(updated?.listing);
    // Ohne Analyse gibt es keine gemessene Kategorie – und keine erfundene.
    assert.equal(updated.listing.category, undefined);
  });

  it("ersetzt einen bestehenden Entwurf vollständig", async () => {
    const project = await withProject();
    await generateListing(project.id);
    await editListing(project.id, { title: "Von Hand" });

    const regenerated = await generateListing(project.id);

    assert.notEqual(regenerated?.listing?.title, "Von Hand");
    assert.notEqual(regenerated?.listing?.basis.title?.rationale, "Von Hand geändert.");
  });

  it("meldet nichts zurück, wenn es das Vorhaben nicht gibt", async () => {
    assert.equal(await generateListing("gibt-es-nicht"), undefined);
  });
});

describe("editListing", () => {
  beforeEach(async () => {
    const { getAnalysisRepository } = await import("@/server/repositories");
    await getAnalysisRepository().save(analysis());
  });

  async function withListing() {
    const created = await createProjectFromIdea({ analysisId: "analyse-1", ideaId: "idee-1" });
    if (typeof created === "string") throw new Error(created);
    const updated = await generateListing(created.id);
    if (!updated) throw new Error("kein Entwurf");
    return updated;
  }

  it("übernimmt den geänderten Wert", async () => {
    const project = await withListing();
    const updated = await editListing(project.id, { title: "Handgeschriebener Titel" });

    assert.notEqual(typeof updated, "string");
    if (typeof updated === "string" || !updated) throw new Error("nicht geändert");
    assert.equal(updated.listing?.title, "Handgeschriebener Titel");
  });

  it("ersetzt die Herkunft des geänderten Feldes", async () => {
    // Sonst behauptete der Vermerk eine Ableitung, die für diesen Wert nie
    // stattgefunden hat.
    const project = await withListing();
    const updated = await editListing(project.id, { title: "Handgeschrieben" });
    if (typeof updated === "string" || !updated) throw new Error("nicht geändert");

    assert.equal(updated.listing?.basis.title?.rationale, "Von Hand geändert.");
    assert.deepEqual(updated.listing?.basis.title?.sources, []);
  });

  it("lässt die Herkunft unangetasteter Felder stehen", async () => {
    const project = await withListing();
    const before = project.listing?.basis.price;
    const updated = await editListing(project.id, { title: "Nur der Titel" });
    if (typeof updated === "string" || !updated) throw new Error("nicht geändert");

    assert.deepEqual(updated.listing?.basis.price, before);
  });

  it("meldet, wenn es noch keinen Entwurf gibt", async () => {
    const created = await createProjectFromIdea({ analysisId: "analyse-1", ideaId: "idee-1" });
    if (typeof created === "string") throw new Error(created);

    assert.equal(await editListing(created.id, { title: "x" }), "no-listing");
  });
});

describe("updateProject", () => {
  it("hebt das Vorhaben in der Übersicht nach oben", async () => {
    const { getAnalysisRepository } = await import("@/server/repositories");
    await getAnalysisRepository().save(analysis());

    const first = await createProjectFromIdea({ analysisId: "analyse-1", ideaId: "idee-1" });
    const second = await createProjectFromIdea({ analysisId: "analyse-1", ideaId: "idee-1" });
    if (typeof first === "string" || typeof second === "string") throw new Error("nicht angelegt");

    await updateProject(first.id, { status: "entwurf" });

    assert.equal((await listProjects())[0]?.id, first.id);
  });
});
