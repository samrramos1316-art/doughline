// Build step 9 end to end on a real alert — by default the butter alert left
// behind by `KEEP_FIXTURES=1 node scripts/test-price-cascade-e2e.mjs`:
//
//   1. Print the alert and its menu_item_margin_impacts rows, and the live
//      inputs the suggestion math uses (prices, costs, recipe quantities).
//   2. GET /api/alerts/[id]/suggestions and check every number against an
//      independent calculation — and that each option really lands on its
//      goal margin when applied to the recipe.
//   3. Exercise the "below target" branch on the same real rows by raising
//      the org's target_margin_pct above the croissant's margin, then restore it.
//   4. POST /api/alerts/[id]/narrative — the real Claude paragraph, printed
//      verbatim, checked for numbers it didn't get from the data; a second
//      POST must come back cached.
//   5. The /alerts/[id] page in headless Edge, with a screenshot.
//
// Run: node scripts/test-suggestions-e2e.mjs --org=<org id> [--alert=<id>] [--cleanup]
//   --cleanup deletes the fixture org and user afterwards.
import fs from "node:fs";
import { chromium } from "playwright-core";
import { loadEnv, getAdminClient, getAnonClient, assert } from "./lib/supabaseTestEnv.mjs";
import { startDevServer, waitForServer, killDevServer } from "./lib/devServer.mjs";
import { ungroundedNumbers } from "../lib/suggestions/narrative.ts";

loadEnv();
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")));
if (!args.org) throw new Error("pass --org=<org id> (from KEEP_FIXTURES=1 test-price-cascade-e2e.mjs)");
const orgId = args.org;

const PORT = 3105;
const BASE_URL = `http://localhost:${PORT}`;
const PROJECT_REF = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname.split(".")[0];
const AUTH_COOKIE_NAME = `sb-${PROJECT_REF}-auth-token`;
const PASSWORD = "Test-Password-123!"; // the fixture scripts' test password
const OUT_DIR = "test-output/suggestions";

const admin = getAdminClient();
let devServer, session, cookieHeader, browser, userId, originalTarget;

const authCookieValue = () => "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
async function api(method, path) {
  const res = await fetch(`${BASE_URL}${path}`, { method, headers: { Cookie: cookieHeader } });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 300) }; }
  return { status: res.status, body: json };
}
const banner = (t) => console.log(`\n${"=".repeat(80)}\n${t}\n${"=".repeat(80)}`);
const round2 = (n) => Math.round(n * 100) / 100;
const close = (a, b, tol) => Math.abs(a - b) <= tol;
const margin = (price, cps) => round2(((price - cps) / price) * 100);

try {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const f of fs.readdirSync(OUT_DIR)) fs.rmSync(`${OUT_DIR}/${f}`);

  const { data: profile } = await admin.from("profiles").select("id").eq("org_id", orgId).limit(1).single();
  userId = profile.id;
  const { data: u } = await admin.auth.admin.getUserById(userId);
  const { data: signIn, error: signInErr } = await getAnonClient().auth.signInWithPassword({ email: u.user.email, password: PASSWORD });
  if (signInErr) throw new Error("sign-in failed: " + signInErr.message);
  session = signIn.session;
  cookieHeader = `${AUTH_COOKIE_NAME}=${authCookieValue()}`;

  const alertId = args.alert ?? (await admin.from("price_alerts").select("id").eq("org_id", orgId).order("created_at", { ascending: false }).limit(1).single()).data.id;
  await admin.from("price_alerts").update({ ai_narrative: null, ai_narrative_model: null, ai_narrative_generated_at: null }).eq("id", alertId);

  devServer = startDevServer(PORT);
  await waitForServer(BASE_URL, 120_000);

  // ------------------------------------------------------------------ 1
  banner("STAGE 1 — the alert and its impact rows (as verified in step 8), and the live inputs");
  const { data: alert } = await admin.from("price_alerts").select("*, ingredients(name, base_unit, current_unit_cost)").eq("id", alertId).single();
  console.log(`price_alerts ${alert.id}: ${alert.ingredients.name} $${alert.previous_unit_cost} -> $${alert.new_unit_cost}/${alert.ingredients.base_unit} (${alert.pct_change}%)`);
  const { data: impacts } = await admin.from("menu_item_margin_impacts")
    .select("menu_item_id, recipe_id, previous_margin_pct, new_margin_pct, margin_pct_delta, menu_items(name, selling_price, servings_per_batch), recipes(name, batch_yield_qty)")
    .eq("price_alert_id", alertId);
  const { data: org } = await admin.from("organizations").select("target_margin_pct").eq("id", orgId).single();
  originalTarget = Number(org.target_margin_pct);
  console.log(`organizations.target_margin_pct = ${originalTarget}`);
  const { data: live } = await admin.from("menu_item_margins").select("menu_item_id, cost_per_serving, margin_pct").eq("org_id", orgId);
  const { data: ri } = await admin.from("recipe_ingredients").select("recipe_id, quantity, ingredient_id, ingredients(current_unit_cost)").eq("org_id", orgId);
  const inputs = {};
  for (const i of impacts) {
    const cps = Number(live.find((l) => l.menu_item_id === i.menu_item_id).cost_per_serving);
    const qty = ri.filter((r) => r.recipe_id === i.recipe_id && r.ingredient_id === alert.ingredient_id).reduce((s, r) => s + Number(r.quantity), 0);
    const servings = Number(i.menu_items.servings_per_batch ?? i.recipes.batch_yield_qty);
    inputs[i.menu_item_id] = { name: i.menu_items.name, price: Number(i.menu_items.selling_price), cps, qty, servings, prev: Number(i.previous_margin_pct), now: Number(i.new_margin_pct), recipe_id: i.recipe_id };
    console.log(`${i.menu_items.name.padEnd(22)} $${i.menu_items.selling_price}  margin ${i.previous_margin_pct}% -> ${i.new_margin_pct}% (${i.margin_pct_delta}pp)  cost/serving now $${cps.toFixed(6)}  ${qty} lb butter per batch of ${servings}`);
  }
  const butterCost = Number(alert.ingredients.current_unit_cost);

  // ------------------------------------------------------------------ 2
  banner(`STAGE 2 — GET /api/alerts/${alertId}/suggestions (deterministic, no AI)`);
  const sug = await api("GET", `/api/alerts/${alertId}/suggestions`);
  assert(sug.status === 200, "suggestions route returns 200");
  console.log(JSON.stringify(sug.body.items.map(({ menu_item_name, selling_price, cost_per_serving, current_margin_pct, goal, raise_price, reduce_portion, target_check }) =>
    ({ menu_item_name, selling_price, cost_per_serving, current_margin_pct, goal, raise_price, reduce_portion, target_check })), null, 2));

  for (const s of sug.body.items) {
    const x = inputs[s.menu_item_id];
    // Independent restatement of §8's math.
    const goalPct = x.now < originalTarget ? originalTarget : x.prev;
    const keep = 1 - goalPct / 100;
    const expPrice = Math.ceil((x.cps / keep) * 100 - 1e-9) / 100;
    const expCut = ((x.cps - x.price * keep) * x.servings) / butterCost;
    const expTargetPrice = Math.ceil((x.cps / (1 - originalTarget / 100)) * 100 - 1e-9) / 100;
    assert(s.goal.kind === (x.now < originalTarget ? "target" : "previous_margin") && s.goal.margin_pct === goalPct,
      `${x.name}: goal = ${s.goal.kind} ${s.goal.margin_pct}% (margin now ${x.now}%, target ${originalTarget}%)`);
    assert(s.raise_price.new_price === expPrice, `${x.name}: raise-price $${s.raise_price.new_price} = ceil(cps $${x.cps.toFixed(6)} / ${keep.toFixed(4)}) = $${expPrice}`);
    assert(margin(s.raise_price.new_price, x.cps) >= goalPct && margin(s.raise_price.new_price - 0.01, x.cps) < goalPct,
      `${x.name}: at $${s.raise_price.new_price} margin is ${margin(s.raise_price.new_price, x.cps)}% (>= ${goalPct}%); a cent less would be ${margin(s.raise_price.new_price - 0.01, x.cps)}%`);
    assert(s.reduce_portion.feasible && close(s.reduce_portion.reduce_by, expCut, 0.0001),
      `${x.name}: cut ${s.reduce_portion.reduce_by} lb (${s.reduce_portion.reduce_by_display}) butter per batch = (cps − price×${keep.toFixed(4)}) × ${x.servings} / $${butterCost}`);
    // Apply the cut to the actual recipe rows and recompute the margin.
    const batch = ri.filter((r) => r.recipe_id === x.recipe_id).reduce((sum, r) => sum + Number(r.quantity) * Number(r.ingredients.current_unit_cost), 0);
    const cpsAfterCut = (batch - s.reduce_portion.reduce_by * butterCost) / x.servings;
    assert(close(margin(x.price, cpsAfterCut), goalPct, 0.011),
      `${x.name}: recipe with ${s.reduce_portion.new_qty} lb butter -> margin ${margin(x.price, cpsAfterCut)}% at the same $${x.price}`);
    assert(s.target_check.price_at_target === expTargetPrice && s.target_check.meets_target === x.now >= originalTarget,
      `${x.name}: price that hits the ${originalTarget}% target is $${expTargetPrice} (meets target now: ${s.target_check.meets_target})`);
  }

  // ------------------------------------------------------------------ 3
  banner("STAGE 3 — same real rows, below-target branch: target_margin_pct raised to 88");
  await admin.from("organizations").update({ target_margin_pct: 88 }).eq("id", orgId);
  const sug88 = await api("GET", `/api/alerts/${alertId}/suggestions`);
  for (const s of sug88.body.items) {
    console.log(`${s.menu_item_name.padEnd(22)} margin ${s.current_margin_pct}%  goal ${s.goal.kind} ${s.goal.margin_pct}%  raise -> $${s.raise_price.new_price}  cut ${s.reduce_portion.feasible ? s.reduce_portion.reduce_by_display : "infeasible: " + s.reduce_portion.reason}`);
  }
  const cr = sug88.body.items.find((s) => s.menu_item_name === "Butter Croissant");
  const crIn = inputs[cr.menu_item_id];
  assert(cr.goal.kind === "target" && cr.goal.margin_pct === 88 && cr.raise_price.new_price === Math.ceil((crIn.cps / 0.12) * 100) / 100,
    `Butter Croissant (87.35% < 88%): goal is the target; price $${cr.raise_price.new_price} = ceil($${crIn.cps.toFixed(6)} / 0.12)`);
  await admin.from("organizations").update({ target_margin_pct: originalTarget }).eq("id", orgId);
  console.log(`target_margin_pct restored to ${originalTarget}`);

  // ------------------------------------------------------------------ 4
  banner(`STAGE 4 — POST /api/alerts/${alertId}/narrative (real Claude call)`);
  const t0 = Date.now();
  const nar = await api("POST", `/api/alerts/${alertId}/narrative`);
  console.log(`HTTP ${nar.status} in ${((Date.now() - t0) / 1000).toFixed(1)}s, model ${nar.body.model}, cached=${nar.body.cached}\n`);
  console.log("----- narrative (verbatim) -----");
  console.log(nar.body.narrative);
  console.log("--------------------------------");
  assert(nar.status === 200 && typeof nar.body.narrative === "string" && nar.body.narrative.length > 100, "Claude returned a narrative paragraph");
  const stray = ungroundedNumbers(nar.body.narrative, sug.body);
  assert(stray.length === 0, `every number in the narrative comes from the data it was given${stray.length ? ` (stray: ${stray.join(", ")})` : ""}`);
  const { data: stored } = await admin.from("price_alerts").select("ai_narrative, ai_narrative_model, ai_narrative_generated_at").eq("id", alertId).single();
  console.log(`price_alerts.ai_narrative_model = ${stored.ai_narrative_model}, ai_narrative_generated_at = ${stored.ai_narrative_generated_at}`);
  assert(stored.ai_narrative === nar.body.narrative, "narrative cached on the price_alerts row");
  const again = await api("POST", `/api/alerts/${alertId}/narrative`);
  assert(again.body.cached === true && again.body.narrative === nar.body.narrative, "second request served from cache (one Claude call per alert)");

  // ------------------------------------------------------------------ 5
  banner("STAGE 5 — /alerts/[id] in headless Edge");
  browser = await chromium.launch({ channel: "msedge", headless: true });
  const context = await browser.newContext({ viewport: { width: 430, height: 900 }, deviceScaleFactor: 2 });
  const value = authCookieValue();
  const CHUNK = 3180;
  const cookies = value.length <= CHUNK
    ? [{ name: AUTH_COOKIE_NAME, value }]
    : Array.from({ length: Math.ceil(value.length / CHUNK) }, (_, i) => ({ name: `${AUTH_COOKIE_NAME}.${i}`, value: value.slice(i * CHUNK, (i + 1) * CHUNK) }));
  await context.addCookies(cookies.map((c) => ({ ...c, domain: "localhost", path: "/", sameSite: "Lax" })));
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/alerts/${alertId}`);
  await page.getByTestId("ai-narrative").waitFor({ timeout: 30_000 });
  for (const t of await page.getByTestId("suggestion").allInnerTexts()) console.log("card: " + t.replace(/\s+/g, " ").trim());
  const shown = await page.getByTestId("ai-narrative").innerText();
  await page.screenshot({ path: `${OUT_DIR}/01-alert-with-suggestions.png`, fullPage: true });
  console.log(`   [screenshot] ${OUT_DIR}/01-alert-with-suggestions.png`);
  assert(shown.trim() === nar.body.narrative.trim(), "page shows the cached narrative");
  const croissantCard = (await page.getByTestId("suggestion").allInnerTexts()).find((t) => t.startsWith("Butter Croissant"));
  const s0 = sug.body.items.find((s) => s.menu_item_name === "Butter Croissant");
  assert(croissantCard.includes(`$${s0.raise_price.new_price.toFixed(2)}`) && croissantCard.includes(s0.reduce_portion.reduce_by_display),
    "croissant card shows the same price and portion numbers as the API");

  console.log("\nSuggestions end-to-end test passed.");
} finally {
  if (originalTarget != null) await admin.from("organizations").update({ target_margin_pct: originalTarget }).eq("id", orgId);
  if (browser) await browser.close();
  killDevServer(devServer);
  if (args.cleanup !== undefined) {
    console.log("\nCleaning up fixture org and user...");
    const { data: files } = await admin.storage.from("invoices").list(orgId);
    if (files?.length) await admin.storage.from("invoices").remove(files.map((f) => `${orgId}/${f.name}`));
    await admin.from("organizations").delete().eq("id", orgId);
    if (userId) await admin.auth.admin.deleteUser(userId);
    console.log("Cleanup done.");
  }
}
