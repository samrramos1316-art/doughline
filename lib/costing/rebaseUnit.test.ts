import { test } from "node:test";
import assert from "node:assert/strict";
import { toBaseUnitCost } from "./units.ts";
import { linesInBaseUnits, needsUnitSize, packSizesAfterUnitChange, rebaseCost, rebasePackSizes, unitChangeFactor, unitChangeFactorWith } from "./rebaseUnit.ts";

const butter = { id: "b", name: "Butter", base_unit: "lb", pack_sizes: null };
const rose = { id: "r", name: "Red rose", base_unit: "stem", pack_sizes: { bunch: 10 } };
const flour = { id: "f", name: "Flour", base_unit: "case", pack_sizes: null };

test("a unit change it can convert keeps what the ingredient costs", () => {
  const f = unitChangeFactor("lb", "oz")!;
  assert.ok(Math.abs(f - 16) < 1e-9);
  assert.equal(rebaseCost(4, f), 0.25); // $4/lb → $0.25/oz
  assert.equal(2 * f * rebaseCost(4, f)!, 8); // 2 lb of it still costs $8
  assert.deepEqual(rebasePackSizes({ box: 10 }, f), { box: 160 });
  assert.equal(rebaseCost(null, f), null);
});

test("nothing to convert: same unit, or no fixed conversion", () => {
  assert.equal(unitChangeFactor("lb", "lbs"), null);
  assert.equal(unitChangeFactor("lb", "case"), null);
  assert.equal(unitChangeFactor("lb", "gal"), null);
  assert.equal(unitChangeFactor("stem", "bunch"), null);
});

test("recipe lines are saved in the ingredient's unit", () => {
  const out = linesInBaseUnits(
    [
      { ingredient_id: "b", quantity: 8, unit: "oz" },
      { ingredient_id: "r", quantity: 2, unit: "bunch" },
      { ingredient_id: "f", quantity: 1, unit: "Cases" },
    ],
    [butter, rose, flour],
  );
  assert.ok("lines" in out);
  assert.deepEqual(out.lines, [
    { ingredient_id: "b", quantity: 0.5, unit: "lb" },
    { ingredient_id: "r", quantity: 20, unit: "stem" },
    { ingredient_id: "f", quantity: 1, unit: "case" },
  ]);
});

test("a unit that doesn't convert is refused, not costed as if it were the base unit", () => {
  assert.deepEqual(linesInBaseUnits([{ ingredient_id: "b", quantity: 1, unit: "cup" }], [butter]), {
    error: `Can't use "cup" for Butter: it's costed per lb`,
  });
  assert.ok("error" in linesInBaseUnits([{ ingredient_id: "x", quantity: 1, unit: "lb" }], [butter]));
});

test("a change with no fixed conversion converts by a size", () => {
  // lb → case: the material's own case size, else the one the owner gives.
  assert.equal(unitChangeFactorWith("lb", "case", { case: 36 }), 1 / 36);
  assert.equal(unitChangeFactorWith("lb", "Cases", { case: 36 }), 1 / 36);
  assert.equal(unitChangeFactorWith("lb", "case", {}, 1 / 50), 1 / 50);
  assert.equal(unitChangeFactorWith("case", "lb", {}, 36), 36);
  assert.equal(unitChangeFactorWith("lb", "case", {}), null);
  assert.equal(unitChangeFactorWith("lb", "oz", {}, 99), 16); // a fixed conversion wins
  assert.ok(needsUnitSize("lb", "case", {}) && !needsUnitSize("lb", "case", { case: 36 }) && !needsUnitSize("lb", "oz", {}) && !needsUnitSize("lb", "lbs", {}));
  // $3.96/lb in a 36 lb case → $142.56/case; 2 lb in a recipe → 0.0556 case, still $7.92.
  const f = unitChangeFactorWith("lb", "case", { case: 36 })!;
  assert.equal(rebaseCost(3.96, f), 142.56);
  assert.ok(Math.abs(2 * f * rebaseCost(3.96, f)! - 7.92) < 1e-6);
});

test("pack sizes after a unit change", () => {
  // lb → case: the case entry goes, lb stays as a size so per-lb invoices convert.
  assert.deepEqual(packSizesAfterUnitChange({ case: 36 }, 1 / 36, "lb", "case"), { lb: 0.02777778 });
  // stem → bunch with a box of 50 stems: box = 5 bunches.
  assert.deepEqual(packSizesAfterUnitChange({ bunch: 10, box: 50 }, 0.1, "stem", "bunch"), { box: 5, stem: 0.1 });
  // A fixed conversion keeps no old-unit entry.
  assert.deepEqual(packSizesAfterUnitChange({ box: 10 }, 16, "lb", "oz"), { box: 160 });
});

test("after lb → case, invoices still priced per lb convert to the case", () => {
  const packs = packSizesAfterUnitChange({ case: 36 }, 1 / 36, "lb", "case");
  const r = toBaseUnitCost({ unit_cost: 3.96, unit: "lb", pack_quantity: null, pack_unit: null }, "case", packs);
  assert.ok(r.ok && Math.abs(r.cost - 142.56) < 1e-4, JSON.stringify(r));
});
