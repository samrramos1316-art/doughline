import { test } from "node:test";
import assert from "node:assert/strict";
import { planOrder, type PlanMaterial, type PlanRecipe } from "./orderPlan.ts";

const materials = new Map<string, PlanMaterial>([
  ["rose", { name: "Red rose", baseUnit: "stem", wastePct: 10, unitCost: 1.2, packSizes: { bunch: 10, box: 25 } }],
  ["euc", { name: "Eucalyptus", baseUnit: "stem", wastePct: 10, unitCost: 0.5, packSizes: { bunch: 10 } }],
  ["vase", { name: "Glass vase", baseUnit: "each", wastePct: 0, unitCost: 4, packSizes: {} }],
  ["ribbon", { name: "Satin ribbon", baseUnit: "ft", wastePct: 0, unitCost: 0.15, packSizes: {} }],
]);
const recipes = new Map<string, PlanRecipe>([
  // A centerpiece: 6 roses, 3 eucalyptus, a vase, 1.5 ft of ribbon.
  ["centerpiece", { yieldQty: 1, lines: [{ ingredientId: "rose", quantity: 6, wastePct: null }, { ingredientId: "euc", quantity: 3, wastePct: null }, { ingredientId: "vase", quantity: 1, wastePct: null }, { ingredientId: "ribbon", quantity: 1.5, wastePct: null }] }],
  // A batch of 4 boutonnieres: 4 roses, with this line's own 20% loss.
  ["bout", { yieldQty: 4, lines: [{ ingredientId: "rose", quantity: 4, wastePct: 20 }] }],
]);

test("stems to buy: arrangements × count, spoilage, whole stems, best pack first", () => {
  const plan = planOrder([{ recipeId: "centerpiece", count: 10 }, { recipeId: "bout", count: 6 }], recipes, materials);
  const rose = plan.rows.find((r) => r.name === "Red rose")!;
  // 60 roses at 10% loss = 66.67, plus 6 at 20% = 7.5 → 74.17 → 75 stems.
  assert.deepEqual([rose.used, rose.toBuy, rose.spoilage], [66, 75, { min: 10, max: 20 }]);
  assert.deepEqual(rose.packs.map((p) => [p.unit, p.count, p.spare]), [["box", 3, 0], ["bunch", 8, 5]]);
  assert.equal(rose.cost, 90);
  const euc = plan.rows.find((r) => r.name === "Eucalyptus")!;
  assert.deepEqual([euc.used, euc.toBuy, euc.packs[0].count, euc.packs[0].spare], [30, 34, 4, 6]); // 33.33 → 34
  const vase = plan.rows.find((r) => r.name === "Glass vase")!;
  assert.deepEqual([vase.toBuy, vase.packs.length], [10, 0]);
  const ribbon = plan.rows.find((r) => r.name === "Satin ribbon")!;
  assert.equal(ribbon.toBuy, 15); // feet, not rounded to whole units beyond cents
  assert.equal(plan.totalCost, 90 + 17 + 40 + 2.25);
  assert.deepEqual(plan.rows.map((r) => r.name), ["Eucalyptus", "Glass vase", "Red rose", "Satin ribbon"]);
});

test("unknown arrangements and zero counts are ignored; an unpriced material leaves the total unknown", () => {
  const unpriced = new Map(materials);
  unpriced.set("vase", { ...materials.get("vase")!, unitCost: null });
  const plan = planOrder([{ recipeId: "centerpiece", count: 1 }, { recipeId: "gone", count: 5 }, { recipeId: "bout", count: 0 }], recipes, unpriced);
  assert.equal(plan.rows.find((r) => r.name === "Red rose")!.toBuy, 7); // 6 / 0.9 = 6.67
  assert.equal(plan.totalCost, null);
});
