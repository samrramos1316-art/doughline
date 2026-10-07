import { test } from "node:test";
import assert from "node:assert/strict";
import { suggestForItem, type ItemInputs } from "./math.ts";

// $9 sandwich, 12 per batch, cost now $3.60 a serving (60% margin) against a
// 65% target. Chicken: 6 lb per batch at $4/lb.
const base: ItemInputs = {
  sellingPrice: 9,
  costPerServing: 3.6,
  servingsPerBatch: 12,
  previousMarginPct: 64,
  targetMarginPct: 65,
  ingredientQtyPerBatch: 6,
  ingredientUnitCost: 4,
  baseUnit: "lb",
};

test("no waste or overhead: cut (cost − allowed) × servings ÷ unit cost", () => {
  const s = suggestForItem(base);
  // allowed $3.15/serving → $0.45 × 12 = $5.40 a batch → 1.35 lb
  assert.equal(s.reduce_portion?.feasible && s.reduce_portion.reduce_by, 1.35);
  assert.deepEqual(suggestForItem({ ...base, ingredientCostFactor: 1 }), s);
});

test("waste and overhead: each pound cut saves more, so cut less", () => {
  // 20% waste (×1.25) and 10% overhead (×1.1): a used pound costs $5.50.
  const s = suggestForItem({ ...base, ingredientCostFactor: 1.25 * 1.1 });
  assert.equal(s.reduce_portion?.feasible && s.reduce_portion.reduce_by, 0.9818);
  // Price suggestions work off cost per serving, which already includes them.
  assert.deepEqual(s.raise_price, suggestForItem(base).raise_price);
});
