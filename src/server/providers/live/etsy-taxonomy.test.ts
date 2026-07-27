import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCategory, indexOf, type TaxonomyNode } from "./etsy-taxonomy";
import type { EtsyListing } from "./etsy";

/**
 * Der Baum aus dem Messlauf, verkleinert: dieselbe Form, dieselben Fallen.
 *
 * `Sports & Fitness` kommt zweimal vor – unter Erwachsenen und unter Kindern.
 * Genau daran entscheidet sich, ob die Auswertung Kategorien über den Pfad
 * oder über den Namen zusammenfasst.
 */
const TREE: TaxonomyNode[] = [
  {
    id: 1,
    name: "Home & Living",
    full_path_taxonomy_ids: [1],
    children: [
      {
        id: 2,
        name: "Kitchen & Dining",
        full_path_taxonomy_ids: [1, 2],
        children: [
          { id: 3, name: "Mugs", full_path_taxonomy_ids: [1, 2, 3], children: [] },
          { id: 4, name: "Tea Cups & Sets", full_path_taxonomy_ids: [1, 2, 4], children: [] },
        ],
      },
    ],
  },
  {
    id: 10,
    name: "Clothing",
    full_path_taxonomy_ids: [10],
    children: [
      {
        id: 11,
        name: "Adult",
        full_path_taxonomy_ids: [10, 11],
        children: [
          { id: 12, name: "Sports & Fitness", full_path_taxonomy_ids: [10, 11, 12], children: [] },
        ],
      },
      {
        id: 13,
        name: "Kids",
        full_path_taxonomy_ids: [10, 13],
        children: [
          { id: 14, name: "Sports & Fitness", full_path_taxonomy_ids: [10, 13, 14], children: [] },
        ],
      },
    ],
  },
];

const INDEX = indexOf(TREE);

/** `n` Listings derselben Kategorie. */
function listings(taxonomyId: number, count: number): EtsyListing[] {
  return Array.from({ length: count }, (_, i) => ({
    listing_id: taxonomyId * 1000 + i,
    taxonomy_id: taxonomyId,
  }));
}

describe("indexOf", () => {
  it("löst jede Blatt-ID zum vollen Pfad auf", () => {
    assert.deepEqual(INDEX.get(3), ["Home & Living", "Kitchen & Dining", "Mugs"]);
  });

  it("erfasst auch die Zwischenknoten – Listings hängen nicht nur an Blättern", () => {
    assert.deepEqual(INDEX.get(2), ["Home & Living", "Kitchen & Dining"]);
  });

  it("fällt ohne Pfadkette auf den eigenen Namen zurück", () => {
    const index = indexOf([{ id: 99, name: "Einzelgänger", children: [] }]);
    assert.deepEqual(index.get(99), ["Einzelgänger"]);
  });

  it("übergeht Knoten ohne Namen, statt einen leeren Pfad zu führen", () => {
    const index = indexOf([{ id: 98, children: [] }]);
    assert.equal(index.get(98), undefined);
  });
});

describe("buildCategory", () => {
  it("misst Anteil und Zahl der führenden Kategorie", () => {
    const signal = buildCategory([...listings(3, 88), ...listings(4, 12)], INDEX);

    assert.equal(signal?.marketplace, "etsy");
    assert.equal(signal?.sampleSize, 100);
    assert.equal(signal?.categories[0]?.name, "Mugs");
    assert.equal(signal?.categories[0]?.share, 0.88);
    assert.equal(signal?.categories[0]?.listings, 88);
  });

  it("hält gleichnamige Kategorien verschiedener Pfade auseinander", () => {
    // Über den Namen zusammengefasst ergäbe das eine Kategorie mit 40
    // Listings – eine, die es bei Etsy nicht gibt.
    const signal = buildCategory([...listings(12, 20), ...listings(14, 20)], INDEX);

    assert.equal(signal?.categories.length, 2);
    assert.deepEqual(
      signal?.categories.map((c) => c.path.join(" > ")).sort(),
      ["Clothing > Adult > Sports & Fitness", "Clothing > Kids > Sports & Fitness"],
    );
  });

  it("wirft den Schwanz der Relevanzsortierung heraus", () => {
    // 4 % und nur vier Listings – beides unter der Schwelle.
    const signal = buildCategory([...listings(3, 96), ...listings(4, 4)], INDEX);

    assert.equal(signal?.categories.length, 1);
    assert.equal(signal?.categories[0]?.name, "Mugs");
  });

  it("meldet die Streuung über alle berührten Kategorien, auch die schwachen", () => {
    const signal = buildCategory([...listings(3, 96), ...listings(4, 4)], INDEX);

    // Zwei berührt, eine belastbar – der Abstand ist die Aussage.
    assert.equal(signal?.distinctCategories, 2);
    assert.equal(signal?.categories.length, 1);
  });

  it("gibt nichts zurück, wenn keine Kategorie die Schwelle nimmt", () => {
    // Zwanzig Kategorien à ein Listing gäbe es hier nicht – aber der Fall,
    // dass alles zerfällt, ist der, in dem eine "Einordnung" nichts einordnet.
    const scattered = Array.from({ length: 10 }, (_, i) => listings(i % 2 === 0 ? 3 : 4, 1)).flat();
    const signal = buildCategory(scattered.slice(0, 4), INDEX);

    assert.equal(signal, undefined);
  });

  it("übergeht Listings ohne oder mit unbekannter taxonomy_id", () => {
    const signal = buildCategory(
      [...listings(3, 10), { listing_id: 1 }, { listing_id: 2, taxonomy_id: 9999 }],
      INDEX,
    );

    assert.equal(signal?.categories[0]?.listings, 10);
    // Der Anteil bezieht sich auf die *ganze* Stichprobe: Zwei nicht
    // einsortierbare Listings sind Teil des Marktes, nur nicht dieser Kategorie.
    assert.equal(signal?.sampleSize, 12);
    assert.equal(signal?.categories[0]?.share, 0.833);
  });

  it("gibt nichts zurück, wenn kein Listing eine Kategorie nennt", () => {
    assert.equal(buildCategory([{ listing_id: 1 }, { listing_id: 2 }], INDEX), undefined);
  });
});
