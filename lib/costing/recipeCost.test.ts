import { test } from "node:test";
import assert from "node:assert/strict";
import { batchCost, effectiveUnitCost, effectiveWastePct, laborCost, lineCost, marginPctOf, perServing } from "./recipeCost.ts";

// The cookie batch from scripts/test-costing-views.mjs: 1000 g flour at
// $0.002, 500 g sugar at $0.0015, 250 g butter at $0.008 → $4.75, 24 cookies.
const cookies = [
  { quantity: 1000, unitCost: 0.002 },
  { quantity: 500, unitCost: 0.0015 },
  { quantity: 250, unitCost: 0.008 },
];
const close = (a: number | null | undefined, b: number) => assert.ok(a != null && Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);

test("zero waste, labor and overhead is exactly the old Σ quantity × cost", () => {
  const old = cookies.reduce((s, l) => s + l.quantity * l.unitCost, 0);
  const c = batchCost(cookies.map((l) => ({ ...l, wastePct: 0 })), { laborMinutes: 0, overheadPct: 0, defaultLaborRatePerHour: 25 });
  assert.deepEqual(c, { materials: old, labor: 0, overhead: 0, total: old });
  assert.equal(batchCost(cookies)!.total, old); // fields left out entirely
  assert.equal(perServing(c!.total, 24), old / 24);
});

test("10% waste: buy 1/0.9 of what's used", () => {
  close(lineCost(900, 0.01, 10), 10);
  const c = batchCost([{ quantity: 1000, unitCost: 0.002, wastePct: 10 }, { quantity: 500, unitCost: 0.0015 }]);
  close(c!.materials, 2 / 0.9 + 0.75);
  close(c!.total, 2 / 0.9 + 0.75);
});

test("labor at the recipe's own rate", () => {
  assert.equal(laborCost({ laborMinutes: 45, laborRatePerHour: 20, defaultLaborRatePerHour: 15 }), 15);
  const c = batchCost(cookies, { laborMinutes: 30, laborRatePerHour: 18, defaultLaborRatePerHour: 12 });
  close(c!.labor, 9);
  close(c!.total, 4.75 + 9);
});

test("labor falls back to the org default rate", () => {
  assert.equal(laborCost({ laborMinutes: 30, laborRatePerHour: null, defaultLaborRatePerHour: 12 }), 6);
  assert.equal(laborCost({ laborMinutes: 30 }), 0); // no rate anywhere: no labor cost
  // A recipe rate of 0 is a rate (volunteer time), not "use the default".
  assert.equal(laborCost({ laborMinutes: 30, laborRatePerHour: 0, defaultLaborRatePerHour: 12 }), 0);
});

test("overhead applies on top of materials plus labor", () => {
  const c = batchCost(cookies, { laborMinutes: 30, defaultLaborRatePerHour: 12, overheadPct: 10 });
  close(c!.total, (4.75 + 6) * 1.1);
  close(c!.overhead, (4.75 + 6) * 0.1);
  close(c!.materials + c!.labor + c!.overhead, c!.total);
});

test("unknown cost: no lines, or any unpriced line", () => {
  assert.equal(batchCost([]), null);
  assert.equal(batchCost([...cookies, { quantity: 5, unitCost: null }]), null);
});

test("margin rounds like the view", () => {
  assert.equal(marginPctOf(3, 4.75 / 24), 93.4);
  assert.equal(marginPctOf(0, 1), null);
  assert.equal(marginPctOf(3, null), null);
});

test("effective unit cost includes waste and overhead", () => {
  assert.equal(effectiveUnitCost(2, [{ quantity: 1 }]), 2);
  close(effectiveUnitCost(2, [{ quantity: 1, wastePct: 20 }], 10), 2 * 1.25 * 1.1);
  // Two lines, one wasteful: weighted by quantity.
  close(effectiveUnitCost(1, [{ quantity: 3 }, { quantity: 1, wastePct: 50 }]), (3 + 2) / 4);
});

test("a line's waste: its own % if set, else its material's", () => {
  assert.equal(effectiveWastePct(null, 3), 3); // follows the material
  assert.equal(effectiveWastePct(undefined, "3.50"), 3.5); // numeric columns arrive as strings
  assert.equal(effectiveWastePct(0, 3), 0); // an explicit 0 overrides
  assert.equal(effectiveWastePct(12, 3), 12);
  assert.equal(effectiveWastePct(null, null), 0);
  // 3% loss on gold, set once on the material: 10 g used costs 10/0.97 g.
  close(lineCost(10, 60, effectiveWastePct(null, 3)), (10 / 0.97) * 60);
  // A food line with nothing set anywhere is still exactly quantity × cost.
  assert.equal(lineCost(1000, 0.002, effectiveWastePct(null, 0)), 1000 * 0.002);
});
