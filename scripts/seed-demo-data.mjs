// Seeds a demo account with realistic ingredients, recipes, price history,
// and menu items so the dashboard (§13 step 4) has real data to look at
// instead of an empty state. Safe to re-run: wipes and recreates the demo
// org each time.
//
// Run: node scripts/seed-demo-data.mjs
import { getAdminClient } from "./lib/supabaseTestEnv.mjs";

const admin = getAdminClient();
const DEMO_EMAIL = "demo@doughtally.test";
const DEMO_PASSWORD = "DoughtallyDemo123!";

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

async function main() {
  // Wipe any previous demo user/org so this is safe to re-run.
  const { data: existingUsers } = await admin.auth.admin.listUsers();
  const existing = existingUsers.users.find((u) => u.email === DEMO_EMAIL);
  if (existing) {
    const { data: profile } = await admin.from("profiles").select("org_id").eq("id", existing.id).maybeSingle();
    if (profile?.org_id) await admin.from("organizations").delete().eq("id", profile.org_id);
    await admin.auth.admin.deleteUser(existing.id);
    console.log("Removed previous demo user/org for a clean reseed.");
  }

  const { data: userData, error: userErr } = await admin.auth.admin.createUser({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { business_name: "Demo Bakery", business_type: "bakery", full_name: "Demo Owner" },
  });
  if (userErr) throw new Error("create demo user failed: " + userErr.message);
  const userId = userData.user.id;

  const { data: profile, error: profileErr } = await admin
    .from("profiles").select("org_id").eq("id", userId).single();
  if (profileErr) throw new Error("demo profile missing: " + profileErr.message);
  const orgId = profile.org_id;

  const ingredientDefs = [
    { name: "Flour", base_unit: "g", current_unit_cost: 0.002 },
    { name: "Sugar", base_unit: "g", current_unit_cost: 0.0015 },
    { name: "Butter", base_unit: "g", current_unit_cost: 0.008 },
    { name: "Eggs", base_unit: "each", current_unit_cost: 0.25 },
    { name: "Chocolate Chips", base_unit: "g", current_unit_cost: 0.01 },
  ];
  const { data: ingredients, error: ingErr } = await admin
    .from("ingredients")
    .insert(ingredientDefs.map((i) => ({ ...i, org_id: orgId, current_unit_cost_updated_at: new Date().toISOString() })))
    .select();
  if (ingErr) throw new Error("insert ingredients failed: " + ingErr.message);
  const byName = Object.fromEntries(ingredients.map((i) => [i.name, i]));

  // A rising-cost trend over the last 60 days, ending at today's
  // current_unit_cost, so the dashboard's sparklines have real shape instead
  // of a single flat point.
  const historyRows = ingredients.flatMap((ing) => {
    const current = Number(ing.current_unit_cost);
    const round = (v) => Math.round(v * 10000) / 10000;
    return [
      { org_id: orgId, ingredient_id: ing.id, unit_cost: round(current * 0.82), unit: ing.base_unit, effective_date: daysAgo(60), source: "manual" },
      { org_id: orgId, ingredient_id: ing.id, unit_cost: round(current * 0.93), unit: ing.base_unit, effective_date: daysAgo(30), source: "manual" },
      { org_id: orgId, ingredient_id: ing.id, unit_cost: current, unit: ing.base_unit, effective_date: daysAgo(0), source: "manual" },
    ];
  });
  const { error: histErr } = await admin.from("ingredient_price_history").insert(historyRows);
  if (histErr) throw new Error("insert price history failed: " + histErr.message);

  const { data: cookieRecipe, error: cookieErr } = await admin
    .from("recipes")
    .insert({ org_id: orgId, name: "Chocolate Chip Cookies", batch_yield_qty: 24, batch_yield_unit: "cookies" })
    .select().single();
  if (cookieErr) throw new Error("insert cookie recipe failed: " + cookieErr.message);

  const { error: cookieRiErr } = await admin.from("recipe_ingredients").insert([
    { org_id: orgId, recipe_id: cookieRecipe.id, ingredient_id: byName.Flour.id, quantity: 1000, unit: "g" },
    { org_id: orgId, recipe_id: cookieRecipe.id, ingredient_id: byName.Sugar.id, quantity: 500, unit: "g" },
    { org_id: orgId, recipe_id: cookieRecipe.id, ingredient_id: byName.Butter.id, quantity: 250, unit: "g" },
    { org_id: orgId, recipe_id: cookieRecipe.id, ingredient_id: byName.Eggs.id, quantity: 2, unit: "each" },
    { org_id: orgId, recipe_id: cookieRecipe.id, ingredient_id: byName["Chocolate Chips"].id, quantity: 300, unit: "g" },
  ]);
  if (cookieRiErr) throw new Error("insert cookie recipe_ingredients failed: " + cookieRiErr.message);

  const { data: cupcakeRecipe, error: cupcakeErr } = await admin
    .from("recipes")
    .insert({ org_id: orgId, name: "Buttercream Cupcakes", batch_yield_qty: 12, batch_yield_unit: "cupcakes" })
    .select().single();
  if (cupcakeErr) throw new Error("insert cupcake recipe failed: " + cupcakeErr.message);

  const { error: cupcakeRiErr } = await admin.from("recipe_ingredients").insert([
    { org_id: orgId, recipe_id: cupcakeRecipe.id, ingredient_id: byName.Flour.id, quantity: 400, unit: "g" },
    { org_id: orgId, recipe_id: cupcakeRecipe.id, ingredient_id: byName.Sugar.id, quantity: 600, unit: "g" },
    { org_id: orgId, recipe_id: cupcakeRecipe.id, ingredient_id: byName.Butter.id, quantity: 500, unit: "g" },
    { org_id: orgId, recipe_id: cupcakeRecipe.id, ingredient_id: byName.Eggs.id, quantity: 3, unit: "each" },
  ]);
  if (cupcakeRiErr) throw new Error("insert cupcake recipe_ingredients failed: " + cupcakeRiErr.message);

  // Three menu items priced to land in each of the three margin-health
  // states (target_margin_pct defaults to 65%): good (>=65%), warning
  // (60-65%), critical (<60%) — so the dashboard shows all three badge
  // colors at once.
  const { error: menuErr } = await admin.from("menu_items").insert([
    { org_id: orgId, recipe_id: cookieRecipe.id, name: "Chocolate Chip Cookie", selling_price: 2.0 },   // ~82.8% margin -> good
    { org_id: orgId, recipe_id: cupcakeRecipe.id, name: "Buttercream Cupcake", selling_price: 1.5 },     // ~64.2% margin -> warning
    { org_id: orgId, recipe_id: cupcakeRecipe.id, name: "Mini Cupcake", selling_price: 1.0 },            // ~46.3% margin -> critical
  ]);
  if (menuErr) throw new Error("insert menu_items failed: " + menuErr.message);

  console.log("\nDemo data seeded successfully.");
  console.log(`Log in at /login with:\n  email:    ${DEMO_EMAIL}\n  password: ${DEMO_PASSWORD}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
