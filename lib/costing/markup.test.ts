import { test } from "node:test";
import assert from "node:assert/strict";
import { formatMarkup, markupFromMargin, markupOf, targetLabel, targetMarginOf } from "./markup.ts";
import { priceForMargin } from "./quote.ts";

test("a multiplier prices at exactly that multiple", () => {
  const keystone = { target_margin_pct: 50, target_markup: 2 };
  assert.equal(targetMarginOf(keystone), 50);
  assert.equal(priceForMargin(12.34, targetMarginOf(keystone)), 24.68);
  const triple = { target_margin_pct: 66.67, target_markup: "3.000" }; // as Postgres returns numeric
  assert.equal(priceForMargin(10, targetMarginOf(triple)), 30); // not 30.01 from the rounded 66.67%
  assert.equal(priceForMargin(10, 66.67), 30.01);
});

test("without a multiplier the margin is used as before", () => {
  assert.equal(targetMarginOf({ target_margin_pct: "65.00", target_markup: null }), 65);
  assert.equal(targetMarginOf({ target_margin_pct: 70 }), 70);
  assert.equal(targetMarginOf(null), 65);
  assert.equal(targetMarginOf({ target_margin_pct: 60, target_markup: 1 }), 60); // 1× isn't a markup
});

test("labels and markups read the way owners say them", () => {
  assert.equal(targetLabel({ target_margin_pct: 65 }), "65%");
  assert.equal(targetLabel({ target_margin_pct: 50, target_markup: 2 }), "2× markup");
  assert.equal(targetLabel({ target_margin_pct: 60, target_markup: 2.5 }), "2.5× markup");
  assert.equal(formatMarkup(markupOf(45, 20.3)), "2.22×");
  assert.equal(markupOf(10, 0), null);
  assert.equal(formatMarkup(markupFromMargin(50)), "2×");
});
