// §13 step 2 verification: create two test users via the Supabase Auth API
// directly (not through the app's signup form) and confirm each gets their
// own organizations + profiles row, correctly populated from signup
// metadata, with no cross-contamination between them.
//
// Run: node scripts/test-signup-org-creation.mjs
import { getAdminClient, assert } from "./lib/supabaseTestEnv.mjs";

const admin = getAdminClient();
const suffix = Date.now();
const emailA = `signup-test-a-${suffix}@example.com`;
const emailB = `signup-test-b-${suffix}@example.com`;
const password = "Test-Password-123!";

let userAId, userBId, orgAId, orgBId;

try {
  // 1. Create user A via the raw Auth Admin API — this is exactly what
  //    supabase.auth.signUp() does under the hood from the app's /signup
  //    form; hitting the API directly proves the org-creation logic lives
  //    in the database (the on_auth_user_created trigger), not in
  //    application code that this script bypasses.
  let { data, error } = await admin.auth.admin.createUser({
    email: emailA,
    password,
    email_confirm: true,
    user_metadata: {
      business_name: "Signup Test Bakery A",
      business_type: "bakery",
      full_name: "Alice Owner",
    },
  });
  if (error) throw new Error("create user A failed: " + error.message);
  userAId = data.user.id;

  let { data: dataB, error: errorB } = await admin.auth.admin.createUser({
    email: emailB,
    password,
    email_confirm: true,
    user_metadata: {
      business_name: "Signup Test Truck B",
      business_type: "food_truck",
      full_name: "Bob Owner",
    },
  });
  if (errorB) throw new Error("create user B failed: " + errorB.message);
  userBId = dataB.user.id;

  // 2. Each user must have exactly one profile row, linked to their own org.
  const { data: profileA, error: profileAErr } = await admin
    .from("profiles")
    .select("id, org_id, full_name")
    .eq("id", userAId)
    .single();
  if (profileAErr) throw new Error("profile A missing: " + profileAErr.message);
  orgAId = profileA.org_id;

  const { data: profileB, error: profileBErr } = await admin
    .from("profiles")
    .select("id, org_id, full_name")
    .eq("id", userBId)
    .single();
  if (profileBErr) throw new Error("profile B missing: " + profileBErr.message);
  orgBId = profileB.org_id;

  console.log("Query result — profile A:", JSON.stringify(profileA));
  console.log("Query result — profile B:", JSON.stringify(profileB));

  assert(!!orgAId && !!orgBId, "both signups produced a profile with an org_id");
  assert(orgAId !== orgBId, "user A and user B were assigned two separate org rows, not one shared org");
  assert(profileA.full_name === "Alice Owner", "profile A's full_name came from signup metadata");
  assert(profileB.full_name === "Bob Owner", "profile B's full_name came from signup metadata");

  // 3. Each org row must exist, be distinct, and carry the right metadata.
  const { data: orgA, error: orgAErr } = await admin
    .from("organizations")
    .select("id, name, business_type")
    .eq("id", orgAId)
    .single();
  if (orgAErr) throw new Error("organization A missing: " + orgAErr.message);

  const { data: orgB, error: orgBErr } = await admin
    .from("organizations")
    .select("id, name, business_type")
    .eq("id", orgBId)
    .single();
  if (orgBErr) throw new Error("organization B missing: " + orgBErr.message);

  console.log("Query result — organization A:", JSON.stringify(orgA));
  console.log("Query result — organization B:", JSON.stringify(orgB));

  assert(orgA.name === "Signup Test Bakery A" && orgA.business_type === "bakery",
    "organization A's name/business_type came from signup metadata, not a default");
  assert(orgB.name === "Signup Test Truck B" && orgB.business_type === "food_truck",
    "organization B's name/business_type came from signup metadata, not a default");

  // 4. A signup with no business_name at all still gets a usable default,
  //    rather than failing (the trigger's coalesce fallback).
  const emailC = `signup-test-c-${suffix}@example.com`;
  const { data: dataC, error: errorC } = await admin.auth.admin.createUser({
    email: emailC, password, email_confirm: true,
  });
  if (errorC) throw new Error("create user C (no metadata) failed: " + errorC.message);
  const { data: profileC, error: profileCErr } = await admin
    .from("profiles").select("org_id").eq("id", dataC.user.id).single();
  if (profileCErr) throw new Error("profile C missing: " + profileCErr.message);
  const { data: orgC } = await admin.from("organizations").select("name").eq("id", profileC.org_id).single();
  console.log("Query result — organization C (no metadata supplied):", JSON.stringify(orgC));
  assert(orgC.name === "My Business", "signup with no business_name still gets a default org name, not a failure");

  // cleanup for user C inline since it's not tracked by the outer finally
  await admin.from("organizations").delete().eq("id", profileC.org_id);
  await admin.auth.admin.deleteUser(dataC.user.id);

  console.log("\nAll signup/org-creation checks passed.");
} finally {
  console.log("\nCleaning up test fixtures...");
  if (orgAId) await admin.from("organizations").delete().eq("id", orgAId);
  if (orgBId) await admin.from("organizations").delete().eq("id", orgBId);
  if (userAId) await admin.auth.admin.deleteUser(userAId);
  if (userBId) await admin.auth.admin.deleteUser(userBId);
  console.log("Cleanup done.");
}
