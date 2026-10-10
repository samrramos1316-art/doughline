import { test } from "node:test";
import assert from "node:assert/strict";
import { eventQuote, priceForMargin, quote } from "./quote.ts";

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

test("a wedding: bouquets and centerpieces, delivery and setup, at a target margin", () => {
  const q = eventQuote({
    items: [
      { name: "Bridal bouquet", quantity: 1, costEach: 62.5 },
      { name: "Bridesmaid bouquet", quantity: 4, costEach: 21.25 },
      { name: "Centerpiece", quantity: 12, costEach: 18 },
    ],
    delivery: 75,
    setupMinutes: 90,
    laborRatePerHour: 20, // $30 of setup
    otherCosts: 40,
    targetMarginPct: 60,
    price: 900,
  });
  assert.equal(q.arrangements, 62.5 + 85 + 216); // 363.5
  assert.equal(q.setupLabor, 30);
  assert.equal(q.extras, 115);
  assert.equal(q.totalCost, 508.5);
  assert.equal(q.suggestedPrice, 1271.25); // 508.5 ÷ 0.4
  assert.equal(q.marginAtPrice, 43.5); // (900 − 508.5) ÷ 900
});

test("event quote: an arrangement without a cost holds the total back, and says which", () => {
  const q = eventQuote({ items: [{ name: "Arch", quantity: 1, costEach: null }, { name: "Boutonniere", quantity: 6, costEach: 4 }], targetMarginPct: 60 });
  assert.deepEqual(q.unpriced, ["Arch"]);
  assert.equal(q.totalCost, null);
  assert.equal(q.suggestedPrice, null);
  // Rows with no quantity don't count, priced or not.
  assert.equal(eventQuote({ items: [{ name: "Arch", quantity: 0, costEach: null }, { name: "Boutonniere", quantity: 6, costEach: 4 }], targetMarginPct: 50 }).suggestedPrice, 48);
  assert.equal(eventQuote({ items: [], targetMarginPct: 50 }).totalCost, null);
});

test("a fabrication job: scrap, labor and machine time, priced per part", () => {
  // 50 ft of flat bar at $3.20 with 8% scrap, 30 min labor at $30/h, 90 min of laser
  // at the shop's $80/h, 10% overhead, 25 parts, 65% target.
  const q = quote({
    lines: [{ quantity: 50, unitCost: 3.2, wastePct: 8 }],
    laborOverhead: { laborMinutes: 60, laborRatePerHour: 30, machineMinutes: 90, defaultMachineRatePerHour: 80, overheadPct: 10 },
    pieces: 25,
    targetMarginPct: 65,
  });
  const total = ((50 / 0.92) * 3.2 + 30 + 120) * 1.1; // 356.3043…
  assert.ok(Math.abs(q.batch!.total - total) < 1e-9);
  assert.ok(Math.abs(q.batch!.machine - 120) < 1e-9);
  assert.ok(Math.abs(q.costPerPiece! - total / 25) < 1e-9); // 14.2522
  assert.equal(q.suggestedPrice, 40.73);
});
