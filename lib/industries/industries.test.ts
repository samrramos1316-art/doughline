import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { INDUSTRIES, INDUSTRY_IDS, VOCAB_KEYS, formSuggestions, industryProfile, normalizeIndustryId, resolveIndustry } from "./index.ts";
import { enabledIndustries, industryOptions, isIndustryEnabled } from "./gate.ts";
import { extractionHints, withIndustryHints } from "./extraction.ts";
import { canonicalUnit, isContainerUnit } from "../costing/units.ts";
import { vocabFor } from "../vocab.ts";

const ALL = "bakery,food_truck,caterer,jewelry,florist,metalworking";

test("registry: every profile is complete and consistent", () => {
  assert.deepEqual(Object.keys(INDUSTRIES).sort(), [...INDUSTRY_IDS].sort());
  for (const p of Object.values(INDUSTRIES)) {
    assert.ok(p.name && p.description, `${p.id}: name and description`);
    assert.ok(["live", "beta", "hidden"].includes(p.status), `${p.id}: status`);
    for (const k of VOCAB_KEYS) assert.ok(typeof p.vocab[k] === "string" && p.vocab[k].trim(), `${p.id}: vocab.${k}`);
    assert.equal(Object.keys(p.vocab).length, VOCAB_KEYS.length, `${p.id}: no stray vocab keys`);
    assert.ok(p.units.length && p.categories.length, `${p.id}: units and categories`);
    for (const u of p.units) assert.ok(canonicalUnit(u) != null || isContainerUnit(u), `${p.id}: unit "${u}" is known to lib/costing/units.ts`);
    for (const u of p.units) if (u !== "case" && u !== "box") assert.ok(canonicalUnit(u) === u, `${p.id}: unit "${u}" is written canonically`);
    const d = p.defaults;
    assert.ok(d.default_waste_pct >= 0 && d.default_waste_pct < 100 && d.default_overhead_pct >= 0, `${p.id}: defaults in range`);
    assert.equal(typeof d.show_labor_by_default, "boolean");
    for (const k of ["invoice", "menu", "recipe"] as const) assert.equal(typeof p.extraction[k], "string");
    for (const code of Object.values(p.market.categoryDefaults)) assert.ok(p.market.series.some((s) => s.code === code), `${p.id}: ${code} is a listed series`);
  }
});

test("registry: food is live, the trades are beta, with the spec's defaults", () => {
  for (const id of ["bakery", "food_truck", "caterer"] as const) assert.equal(INDUSTRIES[id].status, "live");
  for (const id of ["jewelry", "florist", "metalworking"] as const) assert.equal(INDUSTRIES[id].status, "beta");
  assert.deepEqual(
    Object.fromEntries(Object.values(INDUSTRIES).map((p) => [p.id, [p.defaults.default_waste_pct, p.defaults.show_labor_by_default]])),
    { bakery: [0, false], food_truck: [0, false], caterer: [0, false], other: [0, false], jewelry: [5, true], florist: [10, true], metalworking: [8, true] },
  );
});

test("market: only food has ingesting series; they are the ones lib/market/series.ts fetches", () => {
  const series = readFileSync(new URL("../market/series.ts", import.meta.url), "utf8");
  for (const p of Object.values(INDUSTRIES)) {
    for (const s of p.market.series.filter((x) => x.ingesting)) assert.ok(series.includes(`"${s.code}"`), `${s.code} is ingested`);
    for (const s of p.market.series.filter((x) => !x.ingesting)) assert.ok(!series.includes(`"${s.code}"`) && /placeholder/i.test(s.label), `${s.code} is a marked placeholder`);
    assert.equal(resolveIndustry(p.id).hasMarketData, p.family === "food", `${p.id}: Market Watch shown only with data`);
  }
});

test("gate: by default every industry is offered, the trades as beta", () => {
  const all = ["bakery", "food_truck", "caterer", "jewelry", "florist", "metalworking"];
  assert.deepEqual(enabledIndustries(undefined), all);
  assert.deepEqual(enabledIndustries(""), all);
  assert.deepEqual(industryOptions(null, "").map((o) => o.id), all);
  assert.deepEqual(industryOptions(null, "").filter((o) => o.beta).map((o) => o.id), ["jewelry", "florist", "metalworking"]);
  assert.ok(industryOptions(null, "").every((o) => o.description.length > 10));
  assert.equal(isIndustryEnabled("jewelry", ""), true);
  assert.equal(isIndustryEnabled("jewelry", "bakery,caterer"), false); // ENABLED_INDUSTRIES can still narrow it
  assert.equal(isIndustryEnabled("other", ""), true);
  assert.equal(isIndustryEnabled(null, ""), true);
});

test("gate: an env change turns the trades on", () => {
  assert.deepEqual(industryOptions(null, ALL).map((o) => o.id), ["bakery", "food_truck", "caterer", "jewelry", "florist", "metalworking"]);
  assert.ok(isIndustryEnabled("florist", ALL));
  assert.deepEqual(enabledIndustries(" Jewelry , bogus,other "), ["jewelry"]); // unknown and "other" ignored
});

test("gate: an org already set to a switched-off industry keeps it and still loads", () => {
  const FOOD = "bakery,food_truck,caterer";
  const opts = industryOptions("jewelry", FOOD);
  assert.deepEqual(opts.find((o) => o.id === "jewelry"), { id: "jewelry", name: "Jewelry maker", description: INDUSTRIES.jewelry.description, beta: true, offered: false });
  assert.ok(!industryOptions("bakery", FOOD).some((o) => o.id === "jewelry"));
  const p = resolveIndustry("jewelry");
  assert.equal(p.vocab.recipe, "Build sheet");
  assert.equal(p.defaults.default_waste_pct, 5);
});

test("vocab, units and categories: bakery vs metalworking", () => {
  const bakery = resolveIndustry("bakery");
  assert.equal(bakery.vocab.ingredients, "Ingredients");
  assert.ok(bakery.units.includes("lb") && bakery.units.includes("cup"));
  assert.ok(bakery.categories.includes("dry_goods"));
  assert.equal(formSuggestions(bakery), undefined); // food screens keep their own lists

  const metal = resolveIndustry("metalworking");
  assert.deepEqual([metal.vocab.recipe, metal.vocab.menuItem, metal.vocab.ingredient], ["Job", "Quote", "Material"]);
  assert.deepEqual(formSuggestions(metal), { units: ["kg", "lb", "ft", "in", "m", "sheet", "each"], categories: metal.categories });
  assert.ok(metal.categories.includes("outsourced_service"));
});

test("industry_settings overrides, malformed values ignored", () => {
  const p = resolveIndustry("bakery", { units: ["lb", "each"], show_labor: true, default_waste_pct: 3 });
  assert.deepEqual(p.units, ["lb", "each"]);
  assert.equal(p.defaults.show_labor_by_default, true);
  assert.equal(p.defaults.default_waste_pct, 3);
  assert.deepEqual(formSuggestions(p)?.units, ["lb", "each"]);
  const bad = resolveIndustry("florist", { units: "stem", default_waste_pct: 140, show_labor: "yes" });
  assert.deepEqual(bad.units, INDUSTRIES.florist.units);
  assert.equal(bad.defaults.default_waste_pct, 10);
  assert.equal(bad.defaults.show_labor_by_default, true);
});

test("normalizing business_type", () => {
  assert.equal(normalizeIndustryId("Food Truck"), "food_truck");
  assert.equal(normalizeIndustryId("food-truck"), "food_truck");
  assert.equal(normalizeIndustryId("pottery"), "other");
  assert.equal(normalizeIndustryId(null), null);
  assert.equal(normalizeIndustryId("  "), null);
  assert.equal(industryProfile(null).id, "other");
});

// Today's words, written out: if any of these change, a food org's screens changed.
test("snapshot: a food org's labels are exactly today's", () => {
  const today = {
    recipe: "Recipe",
    recipes: "Recipes",
    menuItem: "Menu item",
    menuItems: "Menu items",
    menu: "Menu",
    ingredient: "Ingredient",
    ingredients: "Ingredients",
    yield: "Batch makes",
    serving: "serving",
    servings: "servings",
    onMenu: "on the menu",
    yieldExample: "cookies",
  };
  for (const t of ["bakery", "food_truck", "caterer", "other", null, "anything else"]) assert.deepEqual(vocabFor(t), today);
  assert.deepEqual(
    industryOptions(null, "").map((o) => o.name).slice(0, 3),
    ["Home bakery", "Food truck", "Caterer"], // the signup choices since launch, still first
  );
  for (const id of ["bakery", "food_truck", "caterer", "other"]) assert.equal(formSuggestions(resolveIndustry(id)), undefined);
});

test("extraction prompts: hints for trades, none for food", () => {
  const base = "You extract line items from supplier invoices for a small food business.";
  for (const id of ["bakery", "food_truck", "caterer", "other", null]) {
    for (const k of ["invoice", "menu", "recipe"] as const) {
      assert.equal(extractionHints(id, k), "");
      assert.equal(withIndustryHints(base, extractionHints(id, k)), base); // byte for byte
    }
  }
  const jewelry = withIndustryHints(base, extractionHints("jewelry", "invoice"));
  assert.ok(jewelry.startsWith(base));
  assert.match(jewelry, /troy ounces/);
  assert.match(jewelry, /freight/);
  assert.match(jewelry, /own line items/);
  assert.match(withIndustryHints(base, extractionHints("florist", "invoice")), /stem/);
  assert.match(withIndustryHints(base, extractionHints("metalworking", "invoice")), /CWT/);
  assert.match(withIndustryHints(base, extractionHints("metalworking", "recipe")), /cut list/);
});

test("quotes: a custom piece for jewelry, an event for florists; food has no new screens", () => {
  for (const id of INDUSTRY_IDS) {
    assert.equal(INDUSTRIES[id].features.quote, id === "jewelry" ? "piece" : id === "florist" ? "event" : false, id);
    assert.equal(INDUSTRIES[id].features.packSizes, id === "florist", id);
  }
  assert.equal(resolveIndustry("bakery").features.quote, false);
  assert.equal(resolveIndustry(null).features.quote, false);
  assert.ok(INDUSTRIES.jewelry.categories.includes("outsourced_work"));
});
