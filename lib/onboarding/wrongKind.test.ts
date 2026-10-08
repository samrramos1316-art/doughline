import { test } from "node:test";
import assert from "node:assert/strict";
import { wrongKindMessage } from "./wrongKind.ts";
import { vocabFor } from "../vocab.ts";

test("wrong-kind uploads: food wording is exactly what it was", () => {
  assert.equal(wrongKindMessage("recipe", "menu"), "This looks like a menu, not a recipe.");
  assert.equal(wrongKindMessage("menu", "recipe"), "This looks like a recipe, not a menu.");
  assert.equal(wrongKindMessage("invoice", "menu"), "This looks like a menu, not an invoice.");
  assert.equal(wrongKindMessage("menu", "invoice"), "This looks like a supplier invoice or receipt, not a menu.");
  assert.equal(wrongKindMessage("menu", "other"), "This doesn't look like an invoice, a receipt, a menu or a recipe — check it's the right file.");
  for (const t of ["bakery", "food_truck", "caterer", "other", null]) {
    assert.equal(wrongKindMessage("recipe", "menu", vocabFor(t)), "This looks like a menu, not a recipe.");
  }
});

test("wrong-kind uploads: trades use their own words, with the right article", () => {
  assert.equal(wrongKindMessage("recipe", "menu", vocabFor("jewelry")), "This looks like a product list, not a build sheet.");
  assert.equal(wrongKindMessage("menu", "recipe", vocabFor("florist")), "This looks like an arrangement, not a package list.");
  assert.equal(wrongKindMessage("invoice", "recipe", vocabFor("metalworking")), "This looks like a job, not an invoice.");
});
