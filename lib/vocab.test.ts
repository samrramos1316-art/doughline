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

test("phrase helpers: articles, capitals, the menu document", async () => {
  const { withArticle, cap, menuDoc } = await import("./vocab.ts");
  assert.equal(withArticle("recipe"), "a recipe");
  assert.equal(withArticle("arrangement"), "an arrangement");
  assert.equal(withArticle("ingredient"), "an ingredient");
  assert.equal(withArticle("material"), "a material");
  assert.equal(cap("on the menu"), "On the menu");
  assert.equal(menuDoc(vocabFor("bakery")), "menu");
  assert.equal(menuDoc(vocabFor("jewelry")), "product list");
  assert.equal(menuDoc(vocabFor("florist")), "package list");
});

test("serving words: food keeps 'serving', trades count pieces", () => {
  assert.deepEqual([vocabFor("caterer").serving, vocabFor("caterer").servings, vocabFor("caterer").onMenu], ["serving", "servings", "on the menu"]);
  assert.deepEqual([vocabFor("jewelry").serving, vocabFor("florist").serving, vocabFor("metalworking").serving], ["piece", "arrangement", "part"]);
  assert.deepEqual([vocabFor("jewelry").onMenu, vocabFor("metalworking").onMenu], ["for sale", "quoted"]);
});
