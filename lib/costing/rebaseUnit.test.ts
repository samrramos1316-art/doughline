import { test } from "node:test";
import assert from "node:assert/strict";
import { linesInBaseUnits, rebaseCost, rebasePackSizes, unitChangeFactor } from "./rebaseUnit.ts";

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
