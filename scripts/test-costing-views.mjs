// §13 step 3 verification: hand-compute the expected cost-per-serving and
// margin for one test recipe, then assert the recipe_costs/menu_item_margins
// views return the same numbers. This is the whole point of step 3 — prove
// the costing math end-to-end with hand-entered data before any AI is
// involved.
//
// Run: node scripts/test-costing-views.mjs
import { getAdminClient, assert } from "./lib/supabaseTestEnv.mjs";

const admin = getAdminClient();
const suffix = Date.now();
const email = `costing-test-${suffix}@example.com`;
const password = "Test-Password-123!";

let userId, orgId, flourId, sugarId, butterId, recipeId, menuItemId;

try {
  // 1. A fresh org via a real signup (exercises step 2's trigger too).
  const { data: userData, error: userErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { business_name: `Costing Test Bakery ${suffix}` },
  });
  if (userErr) throw new Error("create user failed: " + userErr.message);
  userId = userData.user.id;

  const { data: profile, error: profileErr } = await admin
    .from("profiles").select("org_id").eq("id", userId).single();
  if (profileErr) throw new Error("profile missing: " + profileErr.message);
  orgId = profile.org_id;

  // 2. Three ingredients with hand-picked, easy-to-verify unit costs
  //    (cost is per gram, matching the recipe's base_unit convention).
  const ingredientDefs = [
    { name: "Test Flour", base_unit: "g", current_unit_cost: 0.002 },   // $0.002/g = $2.00/kg
    { name: "Test Sugar", base_unit: "g", current_unit_cost: 0.0015 },  // $1.50/kg
    { name: "Test Butter", base_unit: "g", current_unit_cost: 0.008 }, // $8.00/kg
  ];
  const { data: ingredients, error: ingErr } = await admin
    .from("ingredients")
    .insert(ingredientDefs.map((i) => ({ ...i, org_id: orgId })))
    .select();
  if (ingErr) throw new Error("insert ingredients failed: " + ingErr.message);

  flourId = ingredients.find((i) => i.name === "Test Flour").id;
  sugarId = ingredients.find((i) => i.name === "Test Sugar").id;
  butterId = ingredients.find((i) => i.name === "Test Butter").id;

  // 3. A recipe: a batch of 24 cookies using
  //    1000g flour, 500g sugar, 250g butter.
  const batchYieldQty = 24;
  const recipeIngredientDefs = [
    { ingredient_id: flourId, quantity: 1000, unit: "g" },
    { ingredient_id: sugarId, quantity: 500, unit: "g" },
    { ingredient_id: butterId, quantity: 250, unit: "g" },
  ];

  const { data: recipe, error: recipeErr } = await admin
    .from("recipes")
    .insert({
      org_id: orgId,
      name: `Test Cookie Batch ${suffix}`,
      batch_yield_qty: batchYieldQty,
      batch_yield_unit: "cookies",
    })
    .select()
    .single();
  if (recipeErr) throw new Error("insert recipe failed: " + recipeErr.message);
  recipeId = recipe.id;

  const { error: riErr } = await admin
    .from("recipe_ingredients")
    .insert(recipeIngredientDefs.map((ri) => ({ ...ri, org_id: orgId, recipe_id: recipeId })));
  if (riErr) throw new Error("insert recipe_ingredients failed: " + riErr.message);

  // 4. Hand-computed expected values (this is the independent arithmetic
  //    the view's output gets checked against — not a copy of the SQL).
  const expectedBatchTotalCost =
    1000 * 0.002 +  // flour: $2.00
    500 * 0.0015 +  // sugar: $0.75
    250 * 0.008;     // butter: $2.00
  // = $4.75
  const expectedCostPerServing = expectedBatchTotalCost / batchYieldQty; // 4.75 / 24 = 0.197916...

  console.log(`Hand-computed batch total cost: $${expectedBatchTotalCost.toFixed(4)}`);
  console.log(`Hand-computed cost per serving: $${expectedCostPerServing.toFixed(4)}`);

  const { data: viewCost, error: viewCostErr } = await admin
    .from("recipe_costs")
    .select("*")
    .eq("recipe_id", recipeId)
    .single();
  if (viewCostErr) throw new Error("recipe_costs view query failed: " + viewCostErr.message);

  console.log("Query result — recipe_costs view row:", JSON.stringify(viewCost));

  assert(
    Math.abs(Number(viewCost.batch_total_cost) - expectedBatchTotalCost) < 0.0001,
    `recipe_costs.batch_total_cost (${viewCost.batch_total_cost}) matches hand-computed $${expectedBatchTotalCost.toFixed(4)}`,
  );
  assert(
    Math.abs(Number(viewCost.cost_per_serving) - expectedCostPerServing) < 0.0001,
    `recipe_costs.cost_per_serving (${viewCost.cost_per_serving}) matches hand-computed $${expectedCostPerServing.toFixed(6)}`,
  );

  // 5. A menu item selling a "cookie" (one serving) at $1.50 — check the
  //    margin math against a hand-computed value too.
  const sellingPrice = 1.5;
  const expectedMarginAmount = sellingPrice - expectedCostPerServing;
  const expectedMarginPct = Math.round((expectedMarginAmount / sellingPrice) * 100 * 100) / 100; // view rounds to 2dp

  const { data: menuItem, error: menuErr } = await admin
    .from("menu_items")
    .insert({
      org_id: orgId,
      recipe_id: recipeId,
      name: `Test Cookie ${suffix}`,
      selling_price: sellingPrice,
    })
    .select()
    .single();
  if (menuErr) throw new Error("insert menu_item failed: " + menuErr.message);
  menuItemId = menuItem.id;

  const { data: viewMargin, error: viewMarginErr } = await admin
    .from("menu_item_margins")
    .select("*")
    .eq("menu_item_id", menuItemId)
    .single();
  if (viewMarginErr) throw new Error("menu_item_margins view query failed: " + viewMarginErr.message);

  console.log("Query result — menu_item_margins view row:", JSON.stringify(viewMargin));
  console.log(`Hand-computed margin amount: $${expectedMarginAmount.toFixed(4)}, margin pct: ${expectedMarginPct}%`);

  assert(
    Math.abs(Number(viewMargin.margin_amount) - expectedMarginAmount) < 0.0001,
    `menu_item_margins.margin_amount (${viewMargin.margin_amount}) matches hand-computed $${expectedMarginAmount.toFixed(4)}`,
  );
  assert(
    Math.abs(Number(viewMargin.margin_pct) - expectedMarginPct) < 0.01,
    `menu_item_margins.margin_pct (${viewMargin.margin_pct}) matches hand-computed ${expectedMarginPct}%`,
  );

  // 6. Change one ingredient's price and confirm the view moves with it
  //    instantly (no cache to invalidate — §3.9's whole point).
  const { error: updateErr } = await admin
    .from("ingredients")
    .update({ current_unit_cost: 0.004 }) // flour doubles: $0.002 -> $0.004/g
    .eq("id", flourId);
  if (updateErr) throw new Error("ingredient price update failed: " + updateErr.message);

  const newExpectedBatchTotalCost = 1000 * 0.004 + 500 * 0.0015 + 250 * 0.008; // $6.75
  const newExpectedCostPerServing = newExpectedBatchTotalCost / batchYieldQty;

  const { data: viewCostAfter, error: viewCostAfterErr } = await admin
    .from("recipe_costs")
    .select("*")
    .eq("recipe_id", recipeId)
    .single();
  if (viewCostAfterErr) throw new Error("recipe_costs view re-query failed: " + viewCostAfterErr.message);

  console.log("Query result — recipe_costs view row after flour price change:", JSON.stringify(viewCostAfter));

  assert(
    Math.abs(Number(viewCostAfter.cost_per_serving) - newExpectedCostPerServing) < 0.0001,
    `recipe_costs.cost_per_serving updates live to $${newExpectedCostPerServing.toFixed(6)} the instant ingredients.current_unit_cost changes, with no recompute step`,
  );

  console.log("\nAll costing view checks passed.");
} finally {
  console.log("\nCleaning up test fixtures...");
  if (menuItemId) await admin.from("menu_items").delete().eq("id", menuItemId);
  if (recipeId) await admin.from("recipes").delete().eq("id", recipeId); // cascades recipe_ingredients
  if (flourId) await admin.from("ingredients").delete().eq("id", flourId);
  if (sugarId) await admin.from("ingredients").delete().eq("id", sugarId);
  if (butterId) await admin.from("ingredients").delete().eq("id", butterId);
  if (orgId) await admin.from("organizations").delete().eq("id", orgId);
  if (userId) await admin.auth.admin.deleteUser(userId);
  console.log("Cleanup done.");
}
