import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalUnit, conversionFactor, isContainerUnit, sameUnit, toBaseUnitCost } from "./units.ts";

const close = (a: number | null, b: number) => assert.ok(a != null && Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);
const line = (unit_cost: number, unit: string | null, pack_quantity: number | null = null, pack_unit: string | null = null) => ({ unit_cost, unit, pack_quantity, pack_unit });

test("existing kitchen conversions are unchanged", () => {
  assert.equal(conversionFactor("lb", "oz"), 453.59237 / 28.349523125);
  close(conversionFactor("lb", "oz"), 16);
  close(conversionFactor("gal", "qt"), 4);
  assert.equal(conversionFactor("kg", "g"), 1000);
  assert.equal(conversionFactor("dozen", "each"), 12);
  assert.equal(conversionFactor("#", "lb"), 1);
  close(conversionFactor("cup", "tbsp"), 16);
  assert.equal(conversionFactor("lb", "gal"), null);
  assert.equal(conversionFactor("case", "lb"), null);
  assert.equal(canonicalUnit("Pounds"), "lb");
  assert.equal(canonicalUnit("oz"), "oz"); // still avoirdupois
});

test("existing invoice price conversions are unchanged", () => {
  assert.deepEqual(toBaseUnitCost(line(2.5, "LB"), "lb"), { ok: true, cost: 2.5, basis: "$2.5 per LB" });
  assert.deepEqual(toBaseUnitCost(line(97.5, "CS", 36, "lb"), "lb"), { ok: true, cost: 2.7083, basis: "$97.5 per CS of 36 lb = 36 lb" });
  assert.deepEqual(toBaseUnitCost(line(48.75, "EA", 15, "dozen"), "each"), { ok: true, cost: 0.2708, basis: "$48.75 per EA of 15 dozen = 180 each" });
  assert.deepEqual(toBaseUnitCost(line(30, "Cases"), "case"), { ok: true, cost: 30, basis: "$30 per Cases" });
  assert.equal(toBaseUnitCost(line(30, "case", 6, "#10 can"), "lb").ok, false);
});

test("per-container units stay containers: priced as printed, pack sizes still used", () => {
  // A bunch of cilantro, a sheet of puff pastry: as before they were in the table.
  assert.deepEqual(toBaseUnitCost(line(1.25, "Bunches", 12, "oz"), "bunch"), { ok: true, cost: 1.25, basis: "$1.25 per Bunches" });
  assert.deepEqual(toBaseUnitCost(line(0.8, "sheet", 10, "oz"), "sheet"), { ok: true, cost: 0.8, basis: "$0.8 per sheet" });
  assert.ok(isContainerUnit("bunch") && isContainerUnit("stems") && isContainerUnit("bag") && isContainerUnit("case"));
  assert.ok(!isContainerUnit("lb") && !isContainerUnit("each") && !isContainerUnit("ft") && !isContainerUnit(null));
  assert.ok(sameUnit("bunches", "bunch") && sameUnit("Stems", "stem"));
});

test("troy weights", () => {
  assert.equal(canonicalUnit("ozt"), "troy oz");
  assert.equal(canonicalUnit("Troy Ounces"), "troy oz");
  assert.equal(conversionFactor("troy oz", "g"), 31.1034768);
  assert.equal(conversionFactor("pennyweight", "g"), 1.55517384);
  close(conversionFactor("troy oz", "dwt"), 20);
  // Gold at $2,400 per troy ounce, costed per gram.
  assert.deepEqual(toBaseUnitCost(line(2400, "ozt"), "g"), { ok: true, cost: 77.1618, basis: "$2400 per ozt" });
});

test("carats and centimeters", () => {
  assert.equal(conversionFactor("carats", "g"), 0.2);
  assert.equal(canonicalUnit("ct"), "each"); // unchanged: a count on food invoices
  close(conversionFactor("in", "cm"), 2.54);
});

test("length", () => {
  assert.equal(conversionFactor("ft", "in"), 0.3048 / 0.0254);
  close(conversionFactor("feet", "inches"), 12);
  close(conversionFactor("m", "ft"), 1 / 0.3048);
  assert.equal(conversionFactor("ft", "lb"), null);
  assert.deepEqual(toBaseUnitCost(line(3, "ft"), "in"), { ok: true, cost: 0.25, basis: "$3 per ft" });
});

test("stems, bunches and sheets", () => {
  assert.equal(conversionFactor("bunch", "stem", { bunch: 10 }), 10);
  assert.equal(conversionFactor("stems", "bunch", { bunch: 10 }), 0.1);
  assert.equal(conversionFactor("dozen", "bunch", { bunch: 12 }), 1);
  assert.equal(conversionFactor("bunch", "stem"), null); // no size: can't know
  assert.equal(conversionFactor("bunch", "bunches"), 1);
  assert.equal(conversionFactor("sheet", "sheets"), 1);
  assert.equal(conversionFactor("stem", "each"), 1);
  // A case of 25 bunches, flower costed per bunch.
  assert.deepEqual(toBaseUnitCost(line(50, "CS", 25, "bunch"), "bunch"), { ok: true, cost: 2, basis: "$50 per CS of 25 bunch = 25 bunch" });
});
