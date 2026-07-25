import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clamp,
  normalize,
  normalizeInverse,
  normalizeLog,
  normalizedEntropy,
  pctChange,
} from "./math";

describe("normalize", () => {
  it("bildet den Bereich auf 0..100 ab und begrenzt Ausreißer", () => {
    assert.equal(normalize(5, 0, 10), 50);
    assert.equal(normalize(-3, 0, 10), 0);
    assert.equal(normalize(99, 0, 10), 100);
  });

  it("liefert bei entartetem Bereich einen neutralen Wert", () => {
    assert.equal(normalize(5, 7, 7), 50);
  });
});

describe("normalizeInverse", () => {
  it("kehrt die Richtung um", () => {
    assert.equal(normalizeInverse(0, 0, 10), 100);
    assert.equal(normalizeInverse(10, 0, 10), 0);
  });
});

describe("normalizeLog", () => {
  it("staucht große Spannweiten", () => {
    const small = normalizeLog(1_000, 500, 300_000);
    const large = normalizeLog(200_000, 500, 300_000);

    assert.ok(small < large);
    assert.ok(small > 0 && large <= 100);
  });
});

describe("normalizedEntropy", () => {
  it("ist 1 bei Gleichverteilung und 0 bei voller Konzentration", () => {
    assert.equal(normalizedEntropy([0.25, 0.25, 0.25, 0.25]), 1);
    assert.equal(normalizedEntropy([1]), 0);
    assert.equal(normalizedEntropy([]), 0);
  });

  it("liegt bei ungleicher Verteilung dazwischen", () => {
    const value = normalizedEntropy([0.7, 0.2, 0.1]);
    assert.ok(value > 0 && value < 1);
  });
});

describe("pctChange", () => {
  it("berechnet die relative Veränderung", () => {
    assert.equal(pctChange(100, 120), 0.2);
    assert.equal(pctChange(100, 80), -0.2);
  });

  it("behandelt den Nullfall ohne Division durch null", () => {
    assert.equal(pctChange(0, 0), 0);
    assert.equal(pctChange(0, 5), 1);
  });
});

describe("clamp", () => {
  it("fängt NaN ab, statt es weiterzureichen", () => {
    assert.equal(clamp(Number.NaN), 0);
  });
});
