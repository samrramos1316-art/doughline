// Recipe line units end to end (lib/costing/rebaseUnit.ts), against a real
// server and the real database: changing an ingredient's base unit carries
// its price, pack sizes and recipe quantities over, so costs don't jump;
// recipe lines saved in another unit are converted or refused.
//
// Needs a production build (`npx next build`); starts `next start` itself.
//   node scripts/test-recipe-units-e2e.mjs
import { spawn, execSync } from "node:child_process";
import { chromium } from "playwright-core";
import { getAdminClient, assert } from "./lib/supabaseTestEnv.mjs";
import { waitForServer } from "./lib/devServer.mjs";

const PORT = 3222;
const BASE = `http://localhost:${PORT}`;
const admin = getAdminClient();
const suffix = Date.now();
const password = "Test-Password-123!";
const email = `recipe-units-${suffix}@example.com`;
let user;

const near = (a, b, tol = 1e-4) => Math.abs(Number(a) - b) <= tol;

const server = spawn("npx", ["next", "start", "--port", String(PORT)], { shell: true, stdio: "ignore" });
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  await waitForServer(BASE, 60_000);
  const { data: created, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { business_name: `Recipe Units ${suffix}`, business_type: "bakery" },
  });
  if (error) throw new Error("create user failed: " + error.message);
  const { data: profile } = await admin.from("profiles").select("org_id").eq("id", created.user.id).single();
  user = { id: created.user.id, orgId: profile.org_id };
  const orgId = profile.org_id;

  // Butter at $4/lb, boxes of 36 lb; a recipe of 2 lb making 4 → $8 a batch.
  const { data: butter } = await admin.from("ingredients")
    .insert({ org_id: orgId, name: "Butter", base_unit: "lb", current_unit_cost: 4, pack_sizes: { box: 36 } })
    .select("id").single();
  const { data: recipe } = await admin.from("recipes")
    .insert({ org_id: orgId, name: "Shortbread", batch_yield_qty: 4, batch_yield_unit: "pieces" }).select("id").single();
  await admin.from("recipe_ingredients").insert({ org_id: orgId, recipe_id: recipe.id, ingredient_id: butter.id, quantity: 2, unit: "lb" });

  const state = async () => {
    const [{ data: ing }, { data: line }, { data: cost }] = await Promise.all([
      admin.from("ingredients").select("base_unit, current_unit_cost, pack_sizes").eq("id", butter.id).single(),
      admin.from("recipe_ingredients").select("quantity, unit").eq("recipe_id", recipe.id).single(),
      admin.from("recipe_costs").select("batch_total_cost").eq("recipe_id", recipe.id).single(),
    ]);
    return { ing, line, batch: Number(cost.batch_total_cost) };
  };
  let s = await state();
  assert(near(s.batch, 8), `starting batch cost $8: ${s.batch}`);

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.setDefaultTimeout(30_000);
  await page.goto(`${BASE}/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: /log in/i }).click();
  await page.waitForURL(/\/dashboard/);
  const api = page.request;

  // 1. Single edit lb → oz.
  let res = await api.patch(`${BASE}/api/ingredients/${butter.id}`, { data: { base_unit: "oz" } });
  assert(res.ok(), `lb → oz saved: ${res.status()}`);
  s = await state();
  assert(Number(s.ing.current_unit_cost) === 0.25, `price carried over: $4/lb → $${s.ing.current_unit_cost}/oz`);
  assert(near(s.line.quantity, 32) && s.line.unit === "oz", `recipe line carried over: 2 lb → ${s.line.quantity} ${s.line.unit}`);
  assert(near(s.ing.pack_sizes.box, 576), `box size carried over: 36 lb → ${s.ing.pack_sizes.box} oz`);
  assert(near(s.batch, 8), `batch cost unchanged: $${s.batch}`);

  // 2. Grid/CSV path oz → g, same price as before (not a new price).
  res = await api.post(`${BASE}/api/ingredients/import`, { data: { rows: [{ id: butter.id, name: "Butter", base_unit: "g", current_unit_cost: 0.25 }] } });
  assert(res.ok(), `grid oz → g saved: ${res.status()} ${await res.text()}`);
  s = await state();
  assert(Number(s.ing.current_unit_cost) === 0.00881849 && near(s.line.quantity, 907.1847) && s.line.unit === "g",
    `grid carried price and line over: $${s.ing.current_unit_cost}/g, ${s.line.quantity} ${s.line.unit}`);
  assert(Math.abs(s.batch - 8) / 8 < 0.005, `batch cost within the 4-decimal price rounding of $8: $${s.batch}`);

  // 3. Grid g → lb with a new price: the line converts, the new price is kept.
  res = await api.post(`${BASE}/api/ingredients/import`, { data: { rows: [{ id: butter.id, name: "Butter", base_unit: "lb", current_unit_cost: 5 }] } });
  assert(res.ok(), `grid g → lb with a new price saved: ${res.status()}`);
  s = await state();
  assert(Number(s.ing.current_unit_cost) === 5 && near(s.line.quantity, 2) && s.line.unit === "lb", `new price kept, line back to ${s.line.quantity} ${s.line.unit}`);
  assert(near(s.batch, 10), `batch at the new price: $${s.batch}`);

  // 4. A change with no fixed conversion (lb → case) needs a size.
  // Without one it's refused, single edit and grid alike, and nothing moves.
  res = await api.patch(`${BASE}/api/ingredients/${butter.id}`, { data: { base_unit: "case" } });
  s = await state();
  assert(res.status() === 400 && s.ing.base_unit === "lb" && Number(s.ing.current_unit_cost) === 5, `lb → case with no size refused: ${res.status()} ${(await res.json()).error}`);
  res = await api.post(`${BASE}/api/ingredients/import`, { data: { rows: [{ id: butter.id, name: "Butter", base_unit: "case" }] } });
  const refused = await res.json();
  s = await state();
  assert(res.status() === 400 && /doesn't convert on its own/.test(refused.row_errors?.[0]?.message) && s.ing.base_unit === "lb", `grid lb → case with no size refused: ${JSON.stringify(refused.row_errors)}`);
  // With a 36 lb case: $5/lb → $180/case, 2 lb → 0.0556 case, the box of 36
  // lb → 1 case, and lb kept as a size; the batch still costs $10.
  res = await api.post(`${BASE}/api/ingredients/import`, { data: { rows: [{ id: butter.id, name: "Butter", base_unit: "case", new_unit_per_old: 1 / 36 }] } });
  assert(res.ok(), `grid lb → case with a size saved: ${res.status()} ${await res.text()}`);
  s = await state();
  assert(s.ing.base_unit === "case" && Number(s.ing.current_unit_cost) === 180 && near(s.line.quantity, 2 / 36, 1e-8) && s.line.unit === "case",
    `price and line carried into cases: $${s.ing.current_unit_cost}/case, ${s.line.quantity} ${s.line.unit}`);
  assert(near(s.ing.pack_sizes.box, 1) && near(s.ing.pack_sizes.lb, 1 / 36, 1e-8), `pack sizes in cases: ${JSON.stringify(s.ing.pack_sizes)}`);
  assert(near(s.batch, 10, 1e-4), `batch cost unchanged: $${s.batch}`);

  // Back to lb through the ingredients grid. It knows the size (lb was kept)
  // and says so; with that size removed, it asks "1 case = ? lb".
  await page.goto(`${BASE}/ingredients`);
  await page.getByLabel("Base unit, row 1").fill("lb");
  const prompt = page.getByTestId("unit-changes");
  await prompt.waitFor();
  assert((await prompt.innerText()).includes("using its size, 1 case = 36 lb"), `grid uses the known size: ${await prompt.innerText()}`);
  await admin.from("ingredients").update({ pack_sizes: { box: 1 } }).eq("id", butter.id);
  await page.goto(`${BASE}/ingredients`);
  await page.getByLabel("Base unit, row 1").fill("lb");
  await prompt.waitFor();
  await page.getByRole("button", { name: /^Save 1 change/ }).click();
  await page.getByRole("status").filter({ hasText: /Say how the units relate for Butter/ }).waitFor();
  await page.getByLabel("How many lb in one case for Butter").fill("36");
  await page.getByRole("button", { name: /^Save 1 change/ }).click();
  await page.getByRole("status").filter({ hasText: /Saved/ }).waitFor();
  s = await state();
  assert(s.ing.base_unit === "lb" && near(s.ing.current_unit_cost, 5, 1e-6) && near(s.line.quantity, 2, 1e-6) && s.line.unit === "lb",
    `grid case → lb: $${s.ing.current_unit_cost}/lb, ${s.line.quantity} ${s.line.unit}`);
  assert(near(s.ing.pack_sizes.case, 36) && near(s.ing.pack_sizes.box, 36) && s.ing.pack_sizes.lb == null, `case kept as a 36 lb size: ${JSON.stringify(s.ing.pack_sizes)}`);
  // Now it knows its case size, lb → case needs nothing more.
  res = await api.patch(`${BASE}/api/ingredients/${butter.id}`, { data: { base_unit: "case" } });
  s = await state();
  assert(res.ok() && near(s.ing.current_unit_cost, 180, 1e-6) && near(s.line.quantity, 2 / 36, 1e-8), `lb → case by its own case size: $${s.ing.current_unit_cost}, ${s.line.quantity} case`);
  res = await api.patch(`${BASE}/api/ingredients/${butter.id}`, { data: { base_unit: "lb" } });
  s = await state();
  assert(res.ok() && near(s.ing.current_unit_cost, 5, 1e-6) && near(s.line.quantity, 2, 1e-6) && s.line.unit === "lb", `and back: $${s.ing.current_unit_cost}/lb, ${s.line.quantity} lb`);

  // 5. Recipe saves convert other units, refuse ones that don't convert.
  res = await api.patch(`${BASE}/api/recipes/${recipe.id}`, { data: { ingredients: [{ ingredient_id: butter.id, quantity: 8, unit: "oz" }] } });
  s = await state();
  assert(res.ok() && near(s.line.quantity, 0.5) && s.line.unit === "lb", `8 oz saved as ${s.line.quantity} ${s.line.unit}`);
  assert(near(s.batch, 2.5), `costed as half a pound: $${s.batch}`);
  res = await api.patch(`${BASE}/api/recipes/${recipe.id}`, { data: { ingredients: [{ ingredient_id: butter.id, quantity: 1, unit: "cup" }] } });
  const body = await res.json();
  s = await state();
  assert(res.status() === 400 && /Can't use "cup" for Butter/.test(body.error) && near(s.line.quantity, 0.5), `cup refused: ${res.status()} ${body.error}`);
  res = await api.post(`${BASE}/api/recipes`, { data: { name: "Butter cookies", batch_yield_qty: 12, batch_yield_unit: "cookies", ingredients: [{ ingredient_id: butter.id, quantity: 454, unit: "g" }] } });
  const { recipe: made } = await res.json();
  const { data: madeLine } = await admin.from("recipe_ingredients").select("quantity, unit").eq("recipe_id", made.id).single();
  assert(res.status() === 201 && near(madeLine.quantity, 1.0009) && madeLine.unit === "lb", `new recipe: 454 g saved as ${madeLine.quantity} ${madeLine.unit}`);

  console.log("\nAll recipe unit checks passed.");
} finally {
  await browser.close();
  try {
    execSync(process.platform === "win32" ? `taskkill /pid ${server.pid} /t /f` : `kill ${server.pid}`, { stdio: "ignore" });
  } catch {
    // already gone
  }
  if (user) {
    await admin.from("organizations").delete().eq("id", user.orgId);
    await admin.auth.admin.deleteUser(user.id);
  }
  console.log("Cleanup done.");
}
