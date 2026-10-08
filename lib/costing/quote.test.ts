import { test } from "node:test";
import assert from "node:assert/strict";
import { priceForMargin, quote } from "./quote.ts";

test("price for a margin: cost ÷ (1 − margin), rounded up to the cent", () => {
  assert.equal(priceForMargin(40, 60), 100);
  assert.equal(priceForMargin(34.1053, 65), 97.45); // 97.4437… → 97.45, never under the margin
  assert.equal(priceForMargin(10, 0), 10);
  assert.equal(priceForMargin(null, 60), null);
  assert.equal(priceForMargin(10, 100), null);
  assert.equal(priceForMargin(10, -5), null);
});

test("a custom ring: 8 g sterling with 5% loss, a $6 stone, 45 min at $24/h", () => {
  const q = quote({
    lines: [
      { quantity: 8, unitCost: 1.2, wastePct: 5 },
      { quantity: 1, unitCost: 6 },
    ],
    laborOverhead: { laborMinutes: 45, laborRatePerHour: 24 },
    pieces: 1,
    targetMarginPct: 65,
    price: 95,
  });
  const cost = (8 / 0.95) * 1.2 + 6 + 18; // 34.1053…
  assert.ok(Math.abs(q.costPerPiece! - cost) < 1e-9);
  assert.equal(q.suggestedPrice, 97.45);
  assert.equal(q.marginAtPrice, 64.1); // the landing page's ring: 64.1% at $95
  assert.equal(q.unpriced, 0);
});

test("overhead, several pieces, and the org's default labor rate", () => {
  const q = quote({
    lines: [{ quantity: 20, unitCost: 2 }], // $40 of metal for the batch
    laborOverhead: { laborMinutes: 120, defaultLaborRatePerHour: 30, overheadPct: 10 }, // $60 labor
    pieces: 4,
    targetMarginPct: 50,
  });
  assert.ok(Math.abs(q.batch!.total - 110) < 1e-9); // (40 + 60) × 1.1
  assert.ok(Math.abs(q.costPerPiece! - 27.5) < 1e-9);
  assert.equal(q.suggestedPrice, 55);
  assert.equal(q.marginAtPrice, null);
});

test("no price yet: nothing is suggested, and it says how many are missing", () => {
  const q = quote({ lines: [{ quantity: 3, unitCost: null }, { quantity: 1, unitCost: 5 }], laborOverhead: {}, pieces: 1, targetMarginPct: 60 });
  assert.equal(q.batch, null);
  assert.equal(q.unpriced, 1);
  assert.equal(q.suggestedPrice, null);
});
