import { test } from "node:test";
import assert from "node:assert/strict";
import { EXAMPLES, workExample, exampleFor } from "./examples.ts";
import { INDUSTRIES } from "./index.ts";

test("the croissant example is the landing page's butter story, to the cent", () => {
  const r = workExample(exampleFor("bakery")!);
  assert.equal(r.marginBefore, 88.64);
  assert.equal(r.marginAfter, 87.35);
  assert.equal(Math.round(r.costAfter * 10000) / 10000, 0.5694);
  assert.equal(r.fixPrice, 5.02);
});

test("every example: a real industry, a price rise that lowers the margin, a fix that restores it", () => {
  assert.deepEqual(EXAMPLES.map((e) => e.industry), ["bakery", "jewelry", "florist", "metalworking"]);
  for (const e of EXAMPLES) {
    assert.ok(INDUSTRIES[e.industry]);
    const r = workExample(e);
    assert.ok(r.costAfter > r.costBefore && r.marginAfter < r.marginBefore, e.id);
    assert.ok(r.fixPrice != null && (r.fixPrice - r.costAfter) / r.fixPrice >= r.marginBefore / 100 - 1e-9, `${e.id}: fix restores the margin`);
    if (e.moved.wastePct) assert.ok(INDUSTRIES[e.industry].units.includes(e.moved.unit), `${e.id}: unit is one the industry uses`);
  }
});

test("worked numbers for the trade examples", () => {
  const ring = workExample(exampleFor("jewelry")!);
  assert.deepEqual([ring.marginBefore, ring.marginAfter, ring.fixPrice], [65.87, 64.1, 99.93]);
  const arrangement = workExample(exampleFor("florist")!);
  assert.deepEqual([arrangement.marginBefore, arrangement.marginAfter, arrangement.fixPrice], [60.44, 54.22, 86.79]);
  // Per bracket: 34 lb of bar / 0.92, $31 bought in, 90 min at $32/h and 30 machine min at $60/h, over 10 parts.
  const bracket = workExample(exampleFor("metalworking")!);
  assert.equal(Math.round(bracket.costAfter * 10000) / 10000, 14.5217);
  assert.deepEqual([bracket.marginBefore, bracket.marginAfter, bracket.fixPrice], [36.68, 33.99, 22.94]);
});
