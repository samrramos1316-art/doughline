import { test } from "node:test";
import assert from "node:assert/strict";
import { vocabFor } from "./vocab.ts";

test("food types and unknown values keep today's wording", () => {
  for (const t of ["bakery", "food_truck", "caterer", "other", null, undefined, "", "spaceship"]) {
    const v = vocabFor(t);
    assert.equal(v.recipes, "Recipes");
    assert.equal(v.menu, "Menu");
    assert.equal(v.ingredient, "Ingredient");
  }
});

test("non-food industries relabel", () => {
  assert.deepEqual(
    [vocabFor("jewelry").recipe, vocabFor("jewelry").menuItem, vocabFor("jewelry").ingredient],
    ["Build sheet", "Product", "Material"],
  );
  assert.deepEqual(
    [vocabFor("florist").recipe, vocabFor("florist").menuItem, vocabFor("florist").ingredient],
    ["Arrangement", "Package", "Stem or supply"],
  );
  assert.deepEqual(
    [vocabFor("metalworking").recipe, vocabFor("metalworking").menuItem, vocabFor("metalworking").ingredient],
    ["Job", "Quote", "Material"],
  );
  assert.equal(vocabFor(" Food Truck ").recipes, "Recipes"); // free-text column: tolerate case/spaces
  assert.equal(vocabFor("Metalworking").menu, "Quotes");
});
