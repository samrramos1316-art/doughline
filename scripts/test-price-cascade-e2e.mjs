// Build step 8 end to end, against real Supabase + real Claude + real Voyage,
// printing the actual rows at each stage (queried straight from the tables):
//
//   1. Seed a bakery: the 15-ingredient master list with last month's costs
//      (+ matching ingredient_price_history), recipes, and menu items — two
//      recipes use Unsalted Butter, one doesn't, plus an inactive menu item.
//   2. Scan the Bluebonnet invoice photo. Claude reads pack sizes ("36/1#" →
//      36 lb); auto-matched lines get their price converted to the
//      ingredient's base unit and applied at scan time.
//   3. Confirm small moves (eggs, flour) through the confirm API: price
//      history + current cost update, no alert (under the org threshold).
//   4. Hand-compute every affected menu item's before/after margin from the
//      costs in the DB, then confirm butter (+16%): check the price_alerts
//      row and every menu_item_margin_impacts row against the hand numbers
//      and against the menu_item_margins view.
//   5. Idempotency (re-confirm writes nothing new) and a brand-new
//      ingredient's first price (no previous cost → no alert).
//   6. The real /alerts pages in headless Edge, with screenshots.
//
// Screenshots: test-output/price-cascade/. KEEP_FIXTURES=1 leaves the data.
//
// Run: node scripts/test-price-cascade-e2e.mjs
import crypto from "node:crypto";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright-core";
import { loadEnv, getAdminClient, getAnonClient, assert } from "./lib/supabaseTestEnv.mjs";
import { startDevServer, waitForServer, killDevServer } from "./lib/devServer.mjs";

loadEnv();
for (const key of ["CLAUDE_API_KEY", "VOYAGE_API_KEY"]) {
  if (!process.env[key]) throw new Error(`Set ${key} in .env.local`);
}

const PORT = 3104;
const BASE_URL = `http://localhost:${PORT}`;
const PROJECT_REF = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname.split(".")[0];
const AUTH_COOKIE_NAME = `sb-${PROJECT_REF}-auth-token`;
const FIXTURE = "scripts/fixtures/invoice-bluebonnet-bakery.jpg";
const OUT_DIR = "test-output/price-cascade";
const LAST_MONTH = "2026-08-15";

// Same master list as the step 7 test, with last month's costs. Unsalted
// Butter was $3.40/lb last month; the invoice's $142.56 for a 36 lb case is
// $3.96/lb — a +16.5% move, over the default 8% threshold. Eggs, flour,
// chocolate and milk move 2–6%, under it.
const INGREDIENTS = [
  { name: "All-Purpose Flour", category: "dry_goods", base_unit: "lb", current_unit_cost: 0.42 },
  { name: "Bread Flour", category: "dry_goods", base_unit: "lb", current_unit_cost: 0.55 },
  { name: "Powdered Sugar", category: "dry_goods", base_unit: "lb", current_unit_cost: 0.95 },
  { name: "Light Brown Sugar", category: "dry_goods", base_unit: "lb", current_unit_cost: 0.88 },
  { name: "Unsalted Butter", category: "dairy", base_unit: "lb", current_unit_cost: 3.4 },
  { name: "Salted Butter", category: "dairy", base_unit: "lb", current_unit_cost: 3.79 },
  { name: "Large Eggs", category: "dairy", base_unit: "each", current_unit_cost: 0.26 },
  { name: "Semi-Sweet Chocolate Chips", category: "dry_goods", base_unit: "lb", current_unit_cost: 3.4 },
  { name: "Dark Chocolate Bar 70%", category: "dry_goods", base_unit: "lb", current_unit_cost: 7.2 },
  { name: "Whole Milk", category: "dairy", base_unit: "gal", current_unit_cost: 4.6 },
  { name: "Buttermilk", category: "dairy", base_unit: "qt", current_unit_cost: 2.1 },
  { name: "Baking Soda", category: "dry_goods", base_unit: "lb", current_unit_cost: 1.2 },
  { name: "Baking Powder", category: "dry_goods", base_unit: "lb", current_unit_cost: 2.9 },
  { name: "Kosher Salt", category: "dry_goods", base_unit: "lb", current_unit_cost: 0.9 },
  { name: "Ground Cinnamon", category: "dry_goods", base_unit: "oz", current_unit_cost: 0.6 },
];

// Quantities are in each ingredient's base unit.
const RECIPES = [
  {
    name: "Chocolate Chip Cookies", batch_yield_qty: 24, batch_yield_unit: "cookies",
    ingredients: {
      "All-Purpose Flour": 1.25, "Unsalted Butter": 1.0, "Light Brown Sugar": 0.9, "Large Eggs": 4,
      "Semi-Sweet Chocolate Chips": 1.5, "Baking Soda": 0.02, "Kosher Salt": 0.02,
    },
  },
  {
    name: "Butter Croissants", batch_yield_qty: 12, batch_yield_unit: "croissants",
    ingredients: { "All-Purpose Flour": 2.0, "Unsalted Butter": 1.25, "Whole Milk": 0.15, "Large Eggs": 1, "Kosher Salt": 0.03 },
  },
  {
    name: "Vanilla Custard", batch_yield_qty: 8, batch_yield_unit: "cups",
    ingredients: { "Whole Milk": 0.5, "Large Eggs": 8, "Powdered Sugar": 0.5 },
  },
];

const MENU_ITEMS = [
  { name: "Chocolate Chip Cookie", recipe: "Chocolate Chip Cookies", selling_price: 3.25 },
  { name: "Cookie 6-Pack", recipe: "Chocolate Chip Cookies", selling_price: 16.0, servings_per_batch: 4 },
  { name: "Butter Croissant", recipe: "Butter Croissants", selling_price: 4.5 },
  { name: "Custard Cup", recipe: "Vanilla Custard", selling_price: 5.0 },
  { name: "Day-Old Croissant Bag", recipe: "Butter Croissants", selling_price: 6.0, servings_per_batch: 3, is_active: false },
];

const TRUTH = {
  "AP FLOUR BLCHD 50# BG": "All-Purpose Flour",
  "BUTTER SWT UNSLTD 36/1#": "Unsalted Butter",
  "EGG LG GR AA LSE 15DZ": "Large Eggs",
  "CHOC CHIP SEMI SWT 1M 25#": "Semi-Sweet Chocolate Chips",
  "MILK WHL GAL 4/1": "Whole Milk",
};

const admin = getAdminClient();
const suffix = Date.now();
const email = `price-cascade-e2e-${suffix}@example.com`;
const password = "Test-Password-123!";

let userId, orgId, devServer, session, cookieHeader, browser, page;
const uploadedPaths = [];
let shot = 0;

function authCookieValue() {
  return "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
}

async function api(method, path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { Cookie: cookieHeader, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 300) }; }
  return { status: res.status, body: json };
}

function banner(title) {
  console.log(`\n${"=".repeat(80)}\n${title}\n${"=".repeat(80)}`);
}

async function screenshot(label) {
  shot += 1;
  const file = `${OUT_DIR}/${String(shot).padStart(2, "0")}-${label}.png`;
  await page.screenshot({ path: file, fullPage: true });
  console.log(`   [screenshot] ${file}`);
}

const round2 = (n) => Math.round(n * 100) / 100;
const round4 = (n) => Math.round(n * 10000) / 10000;
const close = (a, b, tol) => Math.abs(Number(a) - Number(b)) <= tol;

async function ingredientIds() {
  const { data } = await admin.from("ingredients").select("id, name, base_unit, current_unit_cost").eq("org_id", orgId);
  return Object.fromEntries(data.map((i) => [i.name, i]));
}

async function printPriceHistory(ingredientId, label) {
  const { data } = await admin
    .from("ingredient_price_history")
    .select("unit_cost, unit, quantity, effective_date, source, invoice_id")
    .eq("ingredient_id", ingredientId)
    .order("created_at");
  console.log(`-- ingredient_price_history for ${label} --`);
  for (const h of data) {
    console.log(`   ${h.effective_date}  $${h.unit_cost}/${h.unit}  qty ${h.quantity ?? "—"}  source=${h.source}  invoice=${h.invoice_id ? h.invoice_id.slice(0, 8) + "…" : "—"}`);
  }
  return data;
}

// Independent re-implementation of the menu_item_margins view (migration
// 014) in JS, from raw table rows — so the cascade is checked against math
// that doesn't share code with it.
function handMargins(costs, butterCost, recipeRows, recipeIngRows, menuRows) {
  const out = {};
  for (const m of menuRows) {
    const recipe = recipeRows.find((r) => r.id === m.recipe_id);
    let batch = 0;
    for (const ri of recipeIngRows.filter((x) => x.recipe_id === recipe.id)) {
      const cost = ri.ingredient_id === costs["Unsalted Butter"].id ? butterCost : Number(costs.byId[ri.ingredient_id]);
      batch += Number(ri.quantity) * cost;
    }
    const cps = batch / Number(m.servings_per_batch ?? recipe.batch_yield_qty);
    const price = Number(m.selling_price);
    out[m.id] = { name: m.name, cost_per_serving: cps, margin_amount: price - cps, margin_pct: round2(((price - cps) / price) * 100) };
  }
  return out;
}

try {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const f of fs.readdirSync(OUT_DIR)) fs.rmSync(`${OUT_DIR}/${f}`);

  const { data: created, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { business_name: "Sweet Crumb Bakery (price cascade e2e)" },
  });
  if (error) throw new Error("create user failed: " + error.message);
  userId = created.user.id;
  orgId = (await admin.from("profiles").select("org_id").eq("id", userId).single()).data.org_id;
  const { data: signIn, error: signInErr } = await getAnonClient().auth.signInWithPassword({ email, password });
  if (signInErr) throw new Error("sign-in failed: " + signInErr.message);
  session = signIn.session;
  cookieHeader = `${AUTH_COOKIE_NAME}=${authCookieValue()}`;
  const { data: org } = await admin.from("organizations").select("price_alert_threshold_pct").eq("id", orgId).single();
  console.log(`Test org ${orgId}, user ${email}, price_alert_threshold_pct = ${org.price_alert_threshold_pct}`);

  devServer = startDevServer(PORT);
  await waitForServer(BASE_URL, 120_000);

  // ------------------------------------------------------------------ 1
  banner("STAGE 1 — seed ingredients (last month's costs), recipes, menu items");
  const { data: ingRows, error: insErr } = await admin
    .from("ingredients").insert(INGREDIENTS.map((i) => ({ ...i, org_id: orgId }))).select("id, name, current_unit_cost, base_unit");
  if (insErr) throw new Error(insErr.message);
  await admin.from("ingredient_price_history").insert(
    ingRows.map((i) => ({ org_id: orgId, ingredient_id: i.id, unit_cost: i.current_unit_cost, unit: i.base_unit, effective_date: LAST_MONTH, source: "manual" })),
  );
  console.log(execFileSync("node", ["scripts/backfill-ingredient-embeddings.mjs", `--org=${orgId}`], { encoding: "utf8" }).trim());
  let ings = await ingredientIds();

  const recipeIds = {};
  for (const r of RECIPES) {
    const { data: rec } = await admin.from("recipes")
      .insert({ org_id: orgId, name: r.name, batch_yield_qty: r.batch_yield_qty, batch_yield_unit: r.batch_yield_unit })
      .select("id").single();
    recipeIds[r.name] = rec.id;
    await admin.from("recipe_ingredients").insert(Object.entries(r.ingredients).map(([name, quantity]) => ({
      org_id: orgId, recipe_id: rec.id, ingredient_id: ings[name].id, quantity, unit: ings[name].base_unit,
    })));
    console.log(`recipe '${r.name}' (yield ${r.batch_yield_qty} ${r.batch_yield_unit}): ` +
      Object.entries(r.ingredients).map(([n, q]) => `${q} ${ings[n].base_unit} ${n}`).join(", "));
  }
  const { data: menuRows } = await admin.from("menu_items").insert(MENU_ITEMS.map((m) => ({
    org_id: orgId, recipe_id: recipeIds[m.recipe], name: m.name, selling_price: m.selling_price,
    servings_per_batch: m.servings_per_batch ?? null, is_active: m.is_active ?? true,
  }))).select("id, name, recipe_id, selling_price, servings_per_batch, is_active");

  const { data: margins0 } = await admin.from("menu_item_margins").select("name, selling_price, cost_per_serving, margin_pct").eq("org_id", orgId).order("name");
  console.log("\n-- menu_item_margins (view) at last month's costs --");
  for (const m of margins0) console.log(`${m.name.padEnd(24)} $${m.selling_price}  cost/serving $${Number(m.cost_per_serving).toFixed(4)}  margin ${m.margin_pct}%`);

  // ------------------------------------------------------------------ 2
  banner("STAGE 2 — scan the invoice: pack sizes, base-unit conversion, auto-matched prices applied");
  const invoiceId = crypto.randomUUID();
  const path = `${orgId}/${invoiceId}.jpg`;
  const anon = getAnonClient();
  await anon.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
  const { error: upErr } = await anon.storage.from("invoices").upload(path, fs.readFileSync(FIXTURE), { contentType: "image/jpeg" });
  if (upErr) throw new Error("upload failed: " + upErr.message);
  uploadedPaths.push(path);
  const createdInv = await api("POST", "/api/invoices", { id: invoiceId, file_storage_path: path, file_type: "image" });
  assert(createdInv.status === 201, "POST /api/invoices -> 201");
  const t0 = Date.now();
  const scan = await api("POST", `/api/invoices/${invoiceId}/scan`);
  console.log(`POST /api/invoices/${invoiceId}/scan -> HTTP ${scan.status} in ${((Date.now() - t0) / 1000).toFixed(1)}s, status '${scan.body.status}'`);
  assert(scan.status === 200, "scan route returns 200");

  const { data: lines } = await admin
    .from("invoice_line_items")
    .select("id, raw_text, parsed_quantity, parsed_unit, parsed_unit_cost, parsed_pack_quantity, parsed_pack_unit, match_status, base_unit_cost, price_applied_at, price_note, ingredients(name, base_unit)")
    .eq("invoice_id", invoiceId)
    .order("created_at")
    .order("position");
  console.log(`\n-- invoice_line_items (invoice ${invoiceId.slice(0, 8)}…) --`);
  for (const l of lines) {
    console.log(`${l.raw_text.padEnd(26)} ${l.parsed_quantity} ${l.parsed_unit} @ $${l.parsed_unit_cost}  pack=${l.parsed_pack_quantity ?? "—"} ${l.parsed_pack_unit ?? ""}`.padEnd(78) +
      ` ${l.match_status.padEnd(14)} ${l.ingredients?.name ?? "—"}` +
      (l.base_unit_cost != null ? `  applied $${l.base_unit_cost}/${l.ingredients.base_unit}` : "") +
      (l.price_note ? `  note: ${l.price_note}` : ""));
  }
  const byRaw = Object.fromEntries(lines.map((l) => [l.raw_text, l]));
  const EXPECTED_PACK = {
    "AP FLOUR BLCHD 50# BG": [50, "lb"], "BUTTER SWT UNSLTD 36/1#": [36, "lb"], "EGG LG GR AA LSE 15DZ": [15, "dozen"],
    "CHOC CHIP SEMI SWT 1M 25#": [25, "lb"], "MILK WHL GAL 4/1": [4, "gal"], "VANILLA XTRCT PURE 32OZ": [32, "oz"],
  };
  for (const [raw, [q, u]] of Object.entries(EXPECTED_PACK)) {
    const l = byRaw[raw];
    assert(l && Number(l.parsed_pack_quantity) === q && l.parsed_pack_unit?.toLowerCase().replace(/s$/, "") === u,
      `Claude read pack size of '${raw}' as ${l?.parsed_pack_quantity} ${l?.parsed_pack_unit} (expected ${q} ${u})`);
  }
  console.log("\n-- scan response 'prices' (auto-matched lines, applied at scan time) --");
  for (const p of scan.body.prices) console.log(JSON.stringify(p));
  const autoLines = lines.filter((l) => l.match_status === "auto_matched");
  assert(autoLines.length >= 1 && autoLines.every((l) => l.price_applied_at && l.base_unit_cost != null), `all ${autoLines.length} auto-matched line(s) had their price applied at scan`);
  const { count: alertsAfterScan } = await admin.from("price_alerts").select("id", { count: "exact", head: true }).eq("org_id", orgId);
  assert(alertsAfterScan === 0, "no price alerts from the auto-matched lines (their moves are under the threshold)");
  ings = await ingredientIds();
  for (const l of autoLines) await printPriceHistory(ings[l.ingredients.name].id, l.ingredients.name);

  // ------------------------------------------------------------------ 3
  banner("STAGE 3 — confirm small moves (under threshold): history + cost update, no alert");
  for (const raw of ["EGG LG GR AA LSE 15DZ", "AP FLOUR BLCHD 50# BG", "CHOC CHIP SEMI SWT 1M 25#", "MILK WHL GAL 4/1"]) {
    const l = byRaw[raw];
    if (l.match_status === "auto_matched") continue;
    const before = Number(ings[TRUTH[raw]].current_unit_cost);
    const res = await api("POST", `/api/line-items/${l.id}/confirm`, { ingredient_id: ings[TRUTH[raw]].id });
    console.log(`confirm '${raw}' -> ${TRUTH[raw]}: HTTP ${res.status} price=${JSON.stringify(res.body.price)}`);
    assert(res.status === 200 && res.body.price.applied && res.body.price.price_alert_id === null,
      `${TRUTH[raw]}: $${before} -> $${res.body.price.new_unit_cost} (${res.body.price.pct_change}%) applied, no alert`);
  }
  ings = await ingredientIds();
  await printPriceHistory(ings["Large Eggs"].id, "Large Eggs");
  assert(Number(ings["Large Eggs"].current_unit_cost) === round4(48.75 / 180), `Large Eggs current_unit_cost = $48.75 / (15 dozen × 12) = ${round4(48.75 / 180)}`);

  // ------------------------------------------------------------------ 4
  banner("STAGE 4 — confirm butter (+16%): price alert + margin-impact cascade");
  const butter = ings["Unsalted Butter"];
  const newButter = round4(142.56 / 36);
  const expectedPct = round2(((newButter - Number(butter.current_unit_cost)) / Number(butter.current_unit_cost)) * 100);
  console.log(`Unsalted Butter current_unit_cost before: $${butter.current_unit_cost}/lb; invoice: $142.56 per 36 lb case = $${newButter}/lb (${expectedPct > 0 ? "+" : ""}${expectedPct}%)`);

  const { data: recipeRows } = await admin.from("recipes").select("id, name, batch_yield_qty").eq("org_id", orgId);
  const { data: recipeIngRows } = await admin.from("recipe_ingredients").select("recipe_id, ingredient_id, quantity").eq("org_id", orgId);
  const costs = { ...ings, byId: Object.fromEntries(Object.values(ings).map((i) => [i.id, i.current_unit_cost])) };
  const butterRecipes = new Set(recipeIngRows.filter((ri) => ri.ingredient_id === butter.id).map((ri) => ri.recipe_id));
  const affected = menuRows.filter((m) => m.is_active && butterRecipes.has(m.recipe_id));
  const handBefore = handMargins(costs, Number(butter.current_unit_cost), recipeRows, recipeIngRows, affected);
  const handAfter = handMargins(costs, newButter, recipeRows, recipeIngRows, affected);
  console.log("\n-- hand-computed (JS, from raw rows) --");
  for (const m of affected) {
    const b = handBefore[m.id], a = handAfter[m.id];
    console.log(`${m.name.padEnd(24)} cost/serving $${b.cost_per_serving.toFixed(4)} -> $${a.cost_per_serving.toFixed(4)}   margin ${b.margin_pct}% -> ${a.margin_pct}% (${round2(a.margin_pct - b.margin_pct)}pp)   $${b.margin_amount.toFixed(4)} -> $${a.margin_amount.toFixed(4)}`);
  }

  const bl = byRaw["BUTTER SWT UNSLTD 36/1#"];
  const confirm = await api("POST", `/api/line-items/${bl.id}/confirm`, { ingredient_id: butter.id });
  console.log(`\nPOST /api/line-items/${bl.id}/confirm -> HTTP ${confirm.status}\nprice: ${JSON.stringify(confirm.body.price, null, 2)}`);
  assert(confirm.status === 200 && confirm.body.price.applied, "butter confirm applied its price");

  const { data: alerts } = await admin.from("price_alerts").select("*").eq("org_id", orgId);
  console.log("\n-- price_alerts where org_id = test org --");
  console.log(JSON.stringify(alerts, null, 2));
  assert(alerts.length === 1, "exactly one price_alerts row");
  const alert = alerts[0];
  assert(alert.ingredient_id === butter.id && alert.invoice_id === invoiceId, "alert is for Unsalted Butter, linked to this invoice");
  assert(Number(alert.previous_unit_cost) === Number(butter.current_unit_cost) && Number(alert.new_unit_cost) === newButter,
    `previous $${alert.previous_unit_cost} / new $${alert.new_unit_cost} per lb`);
  assert(Number(alert.pct_change) === expectedPct && Number(alert.pct_change) > Number(org.price_alert_threshold_pct),
    `pct_change ${alert.pct_change}% exceeds threshold ${org.price_alert_threshold_pct}%`);

  const { data: impacts } = await admin
    .from("menu_item_margin_impacts")
    .select("menu_item_id, recipe_id, previous_margin_pct, new_margin_pct, margin_pct_delta, previous_margin_amount, new_margin_amount, resolution, menu_items(name), recipes(name)")
    .eq("price_alert_id", alert.id);
  console.log("\n-- menu_item_margin_impacts where price_alert_id = that alert --");
  for (const i of impacts) {
    console.log(`${i.menu_items.name.padEnd(24)} recipe ${i.recipes.name.padEnd(24)} margin_pct ${i.previous_margin_pct} -> ${i.new_margin_pct} (delta ${i.margin_pct_delta})   margin_amount ${i.previous_margin_amount} -> ${i.new_margin_amount}   resolution=${i.resolution}`);
  }
  assert(impacts.length === affected.length, `one impact row per active menu item using butter (${affected.map((m) => m.name).join(", ")})`);
  assert(!impacts.some((i) => i.menu_items.name === "Custard Cup"), "Custard Cup (recipe without butter) not included");
  assert(!impacts.some((i) => i.menu_items.name === "Day-Old Croissant Bag"), "inactive Day-Old Croissant Bag not included");
  for (const i of impacts) {
    const b = handBefore[i.menu_item_id], a = handAfter[i.menu_item_id];
    assert(
      Number(i.previous_margin_pct) === b.margin_pct && Number(i.new_margin_pct) === a.margin_pct &&
        close(i.margin_pct_delta, a.margin_pct - b.margin_pct, 0.005) &&
        close(i.previous_margin_amount, b.margin_amount, 0.0001) && close(i.new_margin_amount, a.margin_amount, 0.0001),
      `${i.menu_items.name}: DB ${i.previous_margin_pct}% -> ${i.new_margin_pct}% matches hand calc ${b.margin_pct}% -> ${a.margin_pct}%`,
    );
    assert(Number(i.margin_pct_delta) < 0, `${i.menu_items.name}: delta ${i.margin_pct_delta}pp is margin compression`);
  }
  const { data: marginsNow } = await admin.from("menu_item_margins").select("menu_item_id, margin_pct").eq("org_id", orgId);
  assert(impacts.every((i) => Number(marginsNow.find((m) => m.menu_item_id === i.menu_item_id).margin_pct) === Number(i.new_margin_pct)),
    "each new_margin_pct equals what the live menu_item_margins view shows now");
  await printPriceHistory(butter.id, "Unsalted Butter");

  // ------------------------------------------------------------------ 5
  banner("STAGE 5 — idempotency, and a new ingredient's first price");
  const again = await api("POST", `/api/line-items/${bl.id}/confirm`, { ingredient_id: butter.id });
  console.log(`re-confirm butter -> HTTP ${again.status} price=${JSON.stringify(again.body.price)}`);
  const { count: alertCount } = await admin.from("price_alerts").select("id", { count: "exact", head: true }).eq("org_id", orgId);
  const { count: butterHist } = await admin.from("ingredient_price_history").select("id", { count: "exact", head: true }).eq("ingredient_id", butter.id);
  assert(again.body.price.applied === false && alertCount === 1 && butterHist === 2, "re-confirm writes no second alert or price-history row");

  const vl = byRaw["VANILLA XTRCT PURE 32OZ"];
  const vres = await api("POST", `/api/line-items/${vl.id}/create-ingredient`, { name: "Pure Vanilla Extract", base_unit: "oz", category: "dry_goods" });
  console.log(`create-ingredient 'Pure Vanilla Extract' (oz) from '${vl.raw_text}' -> HTTP ${vres.status} price=${JSON.stringify(vres.body.price)}`);
  assert(vres.status === 201 && vres.body.price.applied && vres.body.price.previous_unit_cost === null && vres.body.price.price_alert_id === null,
    `first price $${vres.body.price?.new_unit_cost}/oz ($54.10 ÷ 32 oz) set with no alert (nothing to compare against)`);

  // ------------------------------------------------------------------ 6
  banner("STAGE 6 — the real /alerts pages (headless Edge)");
  browser = await chromium.launch({ channel: "msedge", headless: true });
  const context = await browser.newContext({ viewport: { width: 430, height: 900 }, deviceScaleFactor: 2 });
  const value = authCookieValue();
  const CHUNK = 3180;
  const cookies = value.length <= CHUNK
    ? [{ name: AUTH_COOKIE_NAME, value }]
    : Array.from({ length: Math.ceil(value.length / CHUNK) }, (_, i) => ({ name: `${AUTH_COOKIE_NAME}.${i}`, value: value.slice(i * CHUNK, (i + 1) * CHUNK) }));
  await context.addCookies(cookies.map((c) => ({ ...c, domain: "localhost", path: "/", sameSite: "Lax" })));
  page = await context.newPage();

  await page.goto(`${BASE_URL}/alerts`);
  await page.getByRole("heading", { name: "Price Alerts" }).waitFor();
  const listText = (await page.locator("main ul").innerText()).replace(/\s+/g, " ").trim();
  console.log(`/alerts list: "${listText}"`);
  await screenshot("alerts-list");
  assert(/Unsalted Butter \$3\.40\/lb → \$3\.96\/lb/.test(listText) && /\+16\.5%/.test(listText), "alerts list shows the real butter alert");

  await page.goto(`${BASE_URL}/alerts/${alert.id}`);
  await page.getByRole("table").waitFor();
  const rows = await page.locator("tbody tr").allInnerTexts();
  console.log("/alerts/[id] table rows:");
  for (const r of rows) console.log("   " + r.replace(/\s+/g, " ").trim());
  await screenshot("alert-detail");
  assert(rows.length === impacts.length, "alert detail lists every impacted menu item");

  await page.goto(`${BASE_URL}/invoices/${invoiceId}`);
  await page.getByRole("table").waitFor();
  await screenshot("invoice-detail-costs-applied");

  console.log("\nPrice cascade end-to-end test passed.");
} finally {
  if (browser) await browser.close();
  killDevServer(devServer);
  if (process.env.KEEP_FIXTURES === "1") {
    console.log(`\nKEEP_FIXTURES=1 — left in Supabase: org ${orgId}, user ${email}`);
  } else {
    console.log("\nCleaning up test fixtures...");
    if (uploadedPaths.length) await admin.storage.from("invoices").remove(uploadedPaths);
    if (orgId) await admin.from("organizations").delete().eq("id", orgId); // cascades every org-scoped row
    if (userId) await admin.auth.admin.deleteUser(userId);
    console.log("Cleanup done.");
  }
}
