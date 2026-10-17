import { test } from "node:test";
import assert from "node:assert/strict";
import { averagePaid, costOnBasis } from "./priceBasis.ts";

const p = (unit_cost: number | string, effective_date: string, unit = "g") => ({ unit_cost, unit, effective_date });

test("average paid: each purchase in the window counts once, in the base unit", () => {
  const history = [p(50, "2026-03-01"), p("60.0000", "2026-06-01"), p(70, "2026-09-01"), p(40, "2025-12-01"), p(2000, "2026-08-01", "troy oz")];
  assert.deepEqual(averagePaid(history, "g", "2026-04-17"), { avg: 65, count: 2 }); // 60 and 70; older and troy-oz rows left out
  assert.deepEqual(averagePaid(history, "grams", "2026-01-01"), { avg: 60, count: 3 });
  assert.equal(averagePaid(history, "g", "2026-10-01"), null);
});

test("cost on a basis falls back to the latest price", () => {
  assert.equal(costOnBasis("latest", 70, 65), 70);
  assert.equal(costOnBasis("average", 70, 65), 65);
  assert.equal(costOnBasis("average", 70, null), 70);
  assert.equal(costOnBasis("average", null, null), null);
});
