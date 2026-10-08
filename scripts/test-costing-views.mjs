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

let userId, orgId, flourId, sugarId, butterId, recipeId, menuItemId, sixPackId;

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

  // 5b. A menu item with its own servings_per_batch override: the same
  //     24-cookie batch sold as 6-packs (4 per batch) at $7.00. Its cost must
  //     be batch_total_cost / 4, not / 24 (migration 014).
  const sixPackPrice = 7;
  const sixPacksPerBatch = 4;
  const expectedSixPackCost = expectedBatchTotalCost / sixPacksPerBatch; // 4.75 / 4 = 1.1875
  const expectedSixPackMarginPct =
    Math.round(((sixPackPrice - expectedSixPackCost) / sixPackPrice) * 100 * 100) / 100;

  const { data: sixPack, error: sixPackErr } = await admin
    .from("menu_items")
    .insert({
      org_id: orgId,
      recipe_id: recipeId,
      name: `Test Cookie 6-Pack ${suffix}`,
      selling_price: sixPackPrice,
      servings_per_batch: sixPacksPerBatch,
    })
    .select()
    .single();
  if (sixPackErr) throw new Error("insert 6-pack menu_item failed: " + sixPackErr.message);
  sixPackId = sixPack.id;

  const { data: sixPackMargin, error: sixPackMarginErr } = await admin
    .from("menu_item_margins")
    .select("*")
    .eq("menu_item_id", sixPackId)
    .single();
  if (sixPackMarginErr) throw new Error("menu_item_margins 6-pack query failed: " + sixPackMarginErr.message);

  console.log("Query result — menu_item_margins view row (servings_per_batch override):", JSON.stringify(sixPackMargin));

  assert(
    Math.abs(Number(sixPackMargin.cost_per_serving) - expectedSixPackCost) < 0.0001,
    `menu_item_margins.cost_per_serving (${sixPackMargin.cost_per_serving}) honors servings_per_batch: hand-computed $${expectedSixPackCost.toFixed(4)}`,
  );
  assert(
    Math.abs(Number(sixPackMargin.margin_pct) - expectedSixPackMarginPct) < 0.01,
    `menu_item_margins.margin_pct (${sixPackMargin.margin_pct}) with servings_per_batch override matches hand-computed ${expectedSixPackMarginPct}%`,
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

  // 7. Waste, labor and overhead (migration 025). Untouched, they change
  //    nothing: materials_cost is the whole batch cost, labor_cost is 0.
  assert(
    Number(viewCostAfter.materials_cost) === Number(viewCostAfter.batch_total_cost) && Number(viewCostAfter.labor_cost) === 0,
    `no waste/labor/overhead: batch_total_cost = materials_cost (${viewCostAfter.materials_cost}), labor_cost = 0`,
  );

  const viewRow = async () => {
    const { data, error } = await admin.from("recipe_costs").select("*").eq("recipe_id", recipeId).single();
    if (error) throw new Error("recipe_costs re-query failed: " + error.message);
    return data;
  };
  const near = (a, b) => Math.abs(Number(a) - b) < 0.0001;

  // 7a. 10% waste on the flour: 1000 g used = 1111.1 g bought.
  await admin.from("recipe_ingredients").update({ waste_pct: 10 }).eq("recipe_id", recipeId).eq("ingredient_id", flourId);
  const materials = (1000 / 0.9) * 0.004 + 500 * 0.0015 + 250 * 0.008; // 7.19444…
  let v = await viewRow();
  assert(near(v.batch_total_cost, materials), `10% flour waste: batch_total_cost ${v.batch_total_cost} = hand-computed ${materials.toFixed(4)}`);

  // 7b. 30 minutes of labor, no recipe rate → the org default ($12/h) = $6.
  await admin.from("organizations").update({ default_labor_rate_per_hour: 12 }).eq("id", orgId);
  await admin.from("recipes").update({ labor_minutes: 30 }).eq("id", recipeId);
  v = await viewRow();
  assert(near(v.labor_cost, 6) && near(v.batch_total_cost, materials + 6), `labor at the org default rate: labor_cost ${v.labor_cost} = 6, total ${v.batch_total_cost}`);

  // 7c. The recipe's own rate wins ($18/h → $9).
  await admin.from("recipes").update({ labor_rate_per_hour: 18 }).eq("id", recipeId);
  v = await viewRow();
  assert(near(v.labor_cost, 9), `labor at the recipe's own rate: labor_cost ${v.labor_cost} = 9`);

  // 7d. 10% overhead on top of materials + labor.
  await admin.from("recipes").update({ overhead_pct: 10 }).eq("id", recipeId);
  const total = (materials + 9) * 1.1;
  v = await viewRow();
  assert(near(v.batch_total_cost, total) && near(v.cost_per_serving, total / 24), `overhead on materials + labor: batch_total_cost ${v.batch_total_cost} = hand-computed ${total.toFixed(4)}`);
  assert(near(v.materials_cost, materials), `materials_cost ${v.materials_cost} excludes labor and overhead`);

  // 7e. The app's own copy of the formula (lib/costing/recipeCost.ts) agrees.
  const { batchCost } = await import("../lib/costing/recipeCost.ts");
  const app = batchCost(
    [
      { quantity: 1000, unitCost: 0.004, wastePct: 10 },
      { quantity: 500, unitCost: 0.0015 },
      { quantity: 250, unitCost: 0.008 },
    ],
    { laborMinutes: 30, laborRatePerHour: 18, defaultLaborRatePerHour: 12, overheadPct: 10 },
  );
  assert(near(v.batch_total_cost, app.total), `lib/costing/recipeCost.ts gives the view's batch cost (${app.total.toFixed(6)})`);

  const { data: sixPackNow } = await admin.from("menu_item_margins").select("*").eq("menu_item_id", sixPackId).single();
  assert(
    near(sixPackNow.cost_per_serving, total / 4) && near(sixPackNow.labor_cost, 9 / 4),
    `menu_item_margins carries it through per serving: 6-pack costs ${sixPackNow.cost_per_serving}, labor ${sixPackNow.labor_cost}`,
  );

  // 7f. The price cascade (apply_line_item_price) records before/after from
  //     the same view, so waste and overhead amplify the margin move.
  const { data: inv } = await admin.from("invoices").insert({ org_id: orgId, file_storage_path: `test/${suffix}.jpg` }).select("id").single();
  const { data: line } = await admin
    .from("invoice_line_items")
    .insert({ org_id: orgId, invoice_id: inv.id, raw_text: "FLOUR", matched_ingredient_id: flourId, match_status: "confirmed" })
    .select("id")
    .single();
  const { data: applied, error: applyErr } = await admin.rpc("apply_line_item_price", { p_line_item_id: line.id, p_base_unit_cost: 0.006 });
  if (applyErr) throw new Error("apply_line_item_price failed: " + applyErr.message);
  const { data: impact } = await admin
    .from("menu_item_margin_impacts")
    .select("previous_margin_pct, new_margin_pct")
    .eq("price_alert_id", applied.price_alert_id)
    .eq("menu_item_id", sixPackId)
    .single();
  const totalAfter = ((1000 / 0.9) * 0.006 + 500 * 0.0015 + 250 * 0.008 + 9) * 1.1;
  const pctOf = (cost) => Math.round(((sixPackPrice - cost / 4) / sixPackPrice) * 100 * 100) / 100;
  assert(
    Math.abs(Number(impact.previous_margin_pct) - pctOf(total)) < 0.01 && Math.abs(Number(impact.new_margin_pct) - pctOf(totalAfter)) < 0.01,
    `price alert impact uses waste, labor and overhead: ${impact.previous_margin_pct}% → ${impact.new_margin_pct}% (hand-computed ${pctOf(total)}% → ${pctOf(totalAfter)}%)`,
  );

  // 8. Waste per material (migration 027). A line with no waste of its own
  //    (null) follows its ingredient's waste %; a line's own % wins.
  const { data: sugarLine } = await admin.from("recipe_ingredients").select("waste_pct").eq("recipe_id", recipeId).eq("ingredient_id", sugarId).single();
  assert(sugarLine.waste_pct === null, `a line saved without waste follows its material (waste_pct ${sugarLine.waste_pct})`);
  await admin.from("ingredients").update({ waste_pct: 20 }).eq("id", sugarId); // sugar line: null → 20%
  await admin.from("ingredients").update({ waste_pct: 50 }).eq("id", flourId); // flour line keeps its own 10%
  const materials8 = (1000 / 0.9) * 0.006 + (500 / 0.8) * 0.0015 + 250 * 0.008;
  const total8 = (materials8 + 9) * 1.1;
  v = await viewRow();
  assert(
    near(v.materials_cost, materials8) && near(v.batch_total_cost, total8),
    `material waste: sugar follows its 20%, flour keeps its line's 10% over the material's 50%: materials ${v.materials_cost} = ${materials8.toFixed(4)}`,
  );
  const { effectiveWastePct } = await import("../lib/costing/recipeCost.ts");
  const app8 = batchCost(
    [
      { quantity: 1000, unitCost: 0.006, wastePct: effectiveWastePct(10, 50) },
      { quantity: 500, unitCost: 0.0015, wastePct: effectiveWastePct(null, 20) },
      { quantity: 250, unitCost: 0.008, wastePct: effectiveWastePct(null, 0) },
    ],
    { laborMinutes: 30, laborRatePerHour: 18, defaultLaborRatePerHour: 12, overheadPct: 10 },
  );
  assert(near(v.batch_total_cost, app8.total), `lib/costing/recipeCost.ts agrees with the view on material waste (${app8.total.toFixed(6)})`);

  console.log("\nAll costing view checks passed.");
} finally {
  console.log("\nCleaning up test fixtures...");
  if (menuItemId) await admin.from("menu_items").delete().eq("id", menuItemId);
  if (sixPackId) await admin.from("menu_items").delete().eq("id", sixPackId);
  if (recipeId) await admin.from("recipes").delete().eq("id", recipeId); // cascades recipe_ingredients
  if (flourId) await admin.from("ingredients").delete().eq("id", flourId);
  if (sugarId) await admin.from("ingredients").delete().eq("id", sugarId);
  if (butterId) await admin.from("ingredients").delete().eq("id", butterId);
  if (orgId) await admin.from("organizations").delete().eq("id", orgId);
  if (userId) await admin.auth.admin.deleteUser(userId);
  console.log("Cleanup done.");
}
