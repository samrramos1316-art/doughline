// §13 step 1 verification: create two test orgs and prove org A cannot read
// (or write) org B's data. Creates its own fixtures and tears them down
// afterward, regardless of pass/fail.
//
// Run: node scripts/test-rls-isolation.mjs
import { getAdminClient, getAnonClient, assert } from "./lib/supabaseTestEnv.mjs";

const admin = getAdminClient();
const suffix = Date.now();
const emailA = `rls-test-a-${suffix}@example.com`;
const emailB = `rls-test-b-${suffix}@example.com`;
const password = "Test-Password-123!";

let userAId, userBId, orgAId, orgBId, ingredientAId;
const clientA = getAnonClient();
const clientB = getAnonClient();

try {
  // 1. Two confirmed auth users via the Admin API. The on_auth_user_created
  //    trigger (012_handle_new_user_trigger.sql) fires automatically and
  //    creates a separate organizations + profiles row for each — that's
  //    exactly the mechanism step 2 verifies, so here we just read the org
  //    id it produced rather than creating orgs by hand.
  let { data, error } = await admin.auth.admin.createUser({
    email: emailA, password, email_confirm: true,
    user_metadata: { business_name: `RLS Test Org A ${suffix}` },
  });
  if (error) throw new Error("create user A failed: " + error.message);
  userAId = data.user.id;

  ({ data, error } = await admin.auth.admin.createUser({
    email: emailB, password, email_confirm: true,
    user_metadata: { business_name: `RLS Test Org B ${suffix}` },
  }));
  if (error) throw new Error("create user B failed: " + error.message);
  userBId = data.user.id;

  ({ data, error } = await admin.from("profiles").select("org_id").eq("id", userAId).single());
  if (error) throw new Error("reading trigger-created profile A failed: " + error.message);
  orgAId = data.org_id;

  ({ data, error } = await admin.from("profiles").select("org_id").eq("id", userBId).single());
  if (error) throw new Error("reading trigger-created profile B failed: " + error.message);
  orgBId = data.org_id;

  assert(orgAId && orgBId && orgAId !== orgBId, "the two new users landed in two distinct, trigger-created orgs");

  // 2. Sign in as each user to get a real RLS-scoped session.
  ({ error } = await clientA.auth.signInWithPassword({ email: emailA, password }));
  if (error) throw new Error("sign in A failed: " + error.message);
  ({ error } = await clientB.auth.signInWithPassword({ email: emailB, password }));
  if (error) throw new Error("sign in B failed: " + error.message);

  // 4. As user A, insert an ingredient into org A -> should succeed.
  ({ data, error } = await clientA
    .from("ingredients")
    .insert({ org_id: orgAId, name: "RLS Test Chicken Breast", base_unit: "g" })
    .select()
    .single());
  assert(!error && data?.id, "user A can insert an ingredient into their own org A");
  ingredientAId = data.id;

  // 5. As user A, read org A's own organization row -> should succeed.
  let res = await clientA.from("organizations").select("*").eq("id", orgAId);
  assert(!res.error && res.data.length === 1, "user A can read their own organization row");

  // 6. As user B, read org A's ingredients -> RLS must return zero rows.
  res = await clientB.from("ingredients").select("*").eq("org_id", orgAId);
  console.log("Query result — user B reading org A's ingredients:", JSON.stringify(res.data));
  assert(!res.error && res.data.length === 0, "user B reads zero rows querying org A's ingredients (RLS select filter)");

  // 7. As user B, read org A's organizations row directly -> zero rows.
  res = await clientB.from("organizations").select("*").eq("id", orgAId);
  console.log("Query result — user B reading org A's organization row:", JSON.stringify(res.data));
  assert(!res.error && res.data.length === 0, "user B cannot read org A's organizations row");

  // 8. As user B, try to insert into org A (spoofing org_id) -> must be rejected.
  res = await clientB.from("ingredients").insert({ org_id: orgAId, name: "Spoofed ingredient from B", base_unit: "g" });
  console.log("Query result — user B inserting into org A:", JSON.stringify({ status: res.status, error: res.error?.message }));
  assert(!!res.error, "user B is rejected inserting into org A (RLS with_check), got: " + res.error?.message);

  // 9. As user B, try to update org A's ingredient -> zero rows affected.
  res = await clientB.from("ingredients").update({ name: "Hijacked by B" }).eq("id", ingredientAId).select();
  assert(res.data.length === 0, "user B's update of org A's ingredient affects zero rows (RLS update filter)");

  // 10. As user B, try to delete org A's ingredient -> zero rows affected.
  res = await clientB.from("ingredients").delete().eq("id", ingredientAId).select();
  assert(res.data.length === 0, "user B's delete of org A's ingredient affects zero rows (RLS delete filter)");

  // 11. Org A's ingredient survived untouched.
  res = await clientA.from("ingredients").select("*").eq("id", ingredientAId);
  assert(res.data.length === 1 && res.data[0].name === "RLS Test Chicken Breast",
    "org A's ingredient survived untouched after org B's attempted hijack");

  // 12. The costing views. Views run as their owner (bypassing RLS) unless
  // they're security_invoker — migration 021 fixed exactly this leak.
  await clientA.from("ingredients").update({ current_unit_cost: 0.01 }).eq("id", ingredientAId);
  const { data: recipeA } = await clientA.from("recipes")
    .insert({ org_id: orgAId, name: "RLS Test Recipe", batch_yield_qty: 10, batch_yield_unit: "each" }).select().single();
  await clientA.from("recipe_ingredients").insert({ org_id: orgAId, recipe_id: recipeA.id, ingredient_id: ingredientAId, quantity: 100, unit: "g" });
  await clientA.from("menu_items").insert({ org_id: orgAId, recipe_id: recipeA.id, name: "RLS Test Menu Item", selling_price: 5 });
  for (const view of ["recipe_costs", "menu_item_margins"]) {
    const own = await clientA.from(view).select("*");
    const other = await clientB.from(view).select("*");
    console.log(`${view}: user A sees ${own.data?.length}, user B sees ${other.data?.length}`);
    assert(!own.error && own.data.length === 1 && own.data[0].org_id === orgAId, `user A sees their own row in ${view}`);
    assert(!other.error && other.data.length === 0, `user B sees zero rows in ${view} (no other org's costs or margins)`);
  }

  console.log("\nAll RLS isolation checks passed.");
} finally {
  console.log("\nCleaning up test fixtures...");
  if (orgAId) await admin.from("organizations").delete().eq("id", orgAId);
  if (orgBId) await admin.from("organizations").delete().eq("id", orgBId);
  if (userAId) await admin.auth.admin.deleteUser(userAId);
  if (userBId) await admin.auth.admin.deleteUser(userBId);
  console.log("Cleanup done.");
}
