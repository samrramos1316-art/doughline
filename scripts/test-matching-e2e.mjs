// Build step 7 end to end, against real Supabase + real Claude + real Voyage,
// printing the actual data at each stage (queried straight from the tables):
//
//   1. Seed a bakery's master ingredient list — one through
//      POST /api/ingredients (the route embeds it), the rest through
//      scripts/backfill-ingredient-embeddings.mjs — and read the stored
//      embeddings back.
//   2. Scan the Sysco invoice photo: Claude extraction → vendor resolution →
//      Voyage embedding → match_ingredients vector search → confidence
//      routing. Print every stored line, and score each top match against
//      what the line really is.
//   3. §6.3 review gate: the DB trigger refuses 'completed' with unresolved
//      lines; over the org's cap, the Action Required interstitial covers the
//      app (but not the review queue) and POST /api/invoices returns 423.
//   4. Review in the real swipe UI — headless Edge on /invoices/[id]/review,
//      real pointer drags and clicks, deciding each card from what it shows.
//      Screenshot after every action; print the rows those actions wrote.
//   5. Re-scan the same invoice: phrasings confirmed in stage 4 auto-match
//      through vendor_ingredient_aliases at confidence 1.0 with no vector
//      search, and the invoice lands straight on 'completed'.
//
// Voyage calls are few and batched (the account may be on the 3 RPM
// no-payment-method limit; lib/ai/embeddings/voyage.ts retries 429s).
// Screenshots: test-output/matching/. KEEP_FIXTURES=1 leaves the data.
//
// Run: node scripts/test-matching-e2e.mjs
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

const PORT = 3103;
const BASE_URL = `http://localhost:${PORT}`;
const PROJECT_REF = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname.split(".")[0];
const AUTH_COOKIE_NAME = `sb-${PROJECT_REF}-auth-token`;
const FIXTURE = "scripts/fixtures/invoice-sysco-bakery.jpg";
const OUT_DIR = "test-output/matching";

// A small bakery's master list, named the way an owner types them — not the
// way Sysco prints them — with near-neighbours (three sugars, two butters,
// two chocolates, two flours) so matching has to discriminate.
const INGREDIENTS = [
  { name: "All-Purpose Flour", category: "dry_goods", base_unit: "lb", current_unit_cost: 0.42 },
  { name: "Bread Flour", category: "dry_goods", base_unit: "lb", current_unit_cost: 0.55 },
  { name: "Powdered Sugar", category: "dry_goods", base_unit: "lb", current_unit_cost: 0.95 },
  { name: "Light Brown Sugar", category: "dry_goods", base_unit: "lb", current_unit_cost: 0.88 },
  { name: "Unsalted Butter", category: "dairy", base_unit: "lb", current_unit_cost: 3.85 },
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
  // Deliberately absent, though all three are on the invoice: vanilla extract
  // and heavy cream (nothing similar in the list → "add it?"), and granulated
  // sugar, whose lookalikes (powdered, light brown) should surface as wrong-
  // but-plausible candidates the reviewer has to swipe left on.
];

// What each printed line really is. null = not in the master list yet; the
// UI stage creates it with this name/unit.
const TRUTH = {
  "AP FLOUR BLCHD 50# BG": "All-Purpose Flour",
  "SUGAR GRAN XFINE 50#": null,
  "BUTTER SWT UNSLTD 36/1#": "Unsalted Butter",
  "EGG LG GR AA LSE 15DZ": "Large Eggs",
  "CHOC CHIP SEMI SWT 1M 25#": "Semi-Sweet Chocolate Chips",
  "VANILLA XTRCT PURE 32OZ": null,
  "MILK WHL GAL 4/1": "Whole Milk",
  "CRM HVY 40% 12/QT": null,
};
const NEW_INGREDIENTS = {
  "SUGAR GRAN XFINE 50#": { name: "Granulated Sugar", base_unit: "lb", category: "dry_goods" },
  "VANILLA XTRCT PURE 32OZ": { name: "Pure Vanilla Extract", base_unit: "oz", category: "dry_goods" },
  "CRM HVY 40% 12/QT": { name: "Heavy Cream", base_unit: "qt", category: "dairy" },
};
const normalize = (s) => s.toLowerCase().replace(/\s+/g, " ").trim();

// Read the live thresholds out of the app's source so the test can't drift
// from what the scan route actually does.
const thresholdSrc = fs.readFileSync("lib/matching/thresholds.ts", "utf8");
const threshold = (name) => Number(thresholdSrc.match(new RegExp(`export const ${name} = ([\\d.]+)`))[1]);
const AUTO = threshold("AUTO_MATCH_THRESHOLD");
const REVIEW = threshold("REVIEW_THRESHOLD");
const DISPLAY = threshold("SUGGESTION_DISPLAY_THRESHOLD");
const expectedStatus = (top) => (top >= AUTO ? "auto_matched" : top >= REVIEW ? "needs_review" : "new_ingredient");
const expectedCard = (r) => {
  if (!["needs_review", "new_ingredient"].includes(r.match_status)) return "(no card)";
  const shown = (r.candidate_matches ?? []).find((c) => c.similarity >= DISPLAY);
  return shown ? `"${shown.name}"` : "No match found";
};

const admin = getAdminClient();
const suffix = Date.now();
const email = `matching-e2e-${suffix}@example.com`;
const password = "Test-Password-123!";

let userId, orgId, devServer, session, cookieHeader, browser, page;
const invoiceIds = [];
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

function vectorSummary(v) {
  if (v == null) return "null";
  const arr = typeof v === "string" ? JSON.parse(v) : v;
  return `${arr.length} dims [${arr.slice(0, 3).map((x) => x.toFixed(4)).join(", ")}, …]`;
}

async function screenshot(label) {
  shot += 1;
  const file = `${OUT_DIR}/${String(shot).padStart(2, "0")}-${label}.png`;
  await page.screenshot({ path: file, fullPage: true });
  console.log(`   [screenshot] ${file}`);
}

async function printLineItems(invoiceId, label) {
  const { data: rows, error } = await admin
    .from("invoice_line_items")
    .select("id, raw_text, parsed_item_name, match_status, match_confidence, candidate_matches, embedding, ingredients(name)")
    .eq("invoice_id", invoiceId)
    .order("created_at")
    .order("position");
  if (error) throw new Error(error.message);
  console.log(`\n-- invoice_line_items where invoice_id = ${invoiceId} (${label}) --`);
  for (const r of rows) {
    const cands = (r.candidate_matches ?? []).map((c) => `${c.name} ${c.similarity}`).join(" | ") || "—";
    console.log(
      `${r.raw_text.padEnd(26)} read as ${JSON.stringify(r.parsed_item_name)}\n${" ".repeat(27)}status=${r.match_status.padEnd(14)} conf=${String(r.match_confidence ?? "—").padEnd(6)} matched=${r.ingredients?.name ?? "—"}\n` +
        `${" ".repeat(27)}candidate_matches: ${cands}\n${" ".repeat(27)}embedding: ${vectorSummary(r.embedding)}`,
    );
  }
  return rows;
}

async function uploadAndScan() {
  const invoiceId = crypto.randomUUID();
  const path = `${orgId}/${invoiceId}.jpg`;
  const anon = getAnonClient();
  await anon.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
  const { error: uploadErr } = await anon.storage
    .from("invoices")
    .upload(path, fs.readFileSync(FIXTURE), { contentType: "image/jpeg" });
  if (uploadErr) throw new Error("upload failed: " + uploadErr.message);
  uploadedPaths.push(path);

  const created = await api("POST", "/api/invoices", { id: invoiceId, file_storage_path: path, file_type: "image" });
  if (created.status !== 201) throw new Error(`POST /api/invoices -> ${created.status} ${JSON.stringify(created.body)}`);
  invoiceIds.push(invoiceId);

  const t0 = Date.now();
  const scan = await api("POST", `/api/invoices/${invoiceId}/scan`);
  console.log(
    `POST /api/invoices/${invoiceId}/scan -> HTTP ${scan.status} in ${((Date.now() - t0) / 1000).toFixed(1)}s, ` +
      `invoice status '${scan.body.status}', matching_error=${JSON.stringify(scan.body.matching_error)}`,
  );
  return { invoiceId, scan };
}

async function openBrowser() {
  browser = await chromium.launch({ channel: "msedge", headless: true });
  const context = await browser.newContext({ viewport: { width: 430, height: 900 }, deviceScaleFactor: 2 });
  // @supabase/ssr splits auth cookies over ~3180 chars into name.0, name.1, …
  const value = authCookieValue();
  const CHUNK = 3180;
  const cookies =
    value.length <= CHUNK
      ? [{ name: AUTH_COOKIE_NAME, value }]
      : Array.from({ length: Math.ceil(value.length / CHUNK) }, (_, i) => ({
          name: `${AUTH_COOKIE_NAME}.${i}`,
          value: value.slice(i * CHUNK, (i + 1) * CHUNK),
        }));
  await context.addCookies(cookies.map((c) => ({ ...c, domain: "localhost", path: "/", sameSite: "Lax" })));
  page = await context.newPage();
  page.on("response", async (res) => {
    const url = new URL(res.url());
    if (!url.pathname.startsWith("/api/line-items/")) return;
    let summary = "";
    try {
      const b = await res.json();
      if (b.alias) summary = ` alias '${b.alias.raw_text_normalized}' -> ${b.alias.ingredient_id}, invoice now '${b.invoiceStatus}'`;
      else if (b.lineItem) summary = ` line now '${b.lineItem.match_status}', ${(b.lineItem.candidate_matches ?? []).length} candidate(s) left`;
      if (b.ingredient) summary = ` created ingredient '${b.ingredient.name}' (${b.ingredient.id}),` + summary;
      if (b.error) summary = ` error: ${b.error}`;
    } catch {}
    console.log(`   [network] ${res.request().method()} ${url.pathname} -> ${res.status()}${summary}`);
  });
}

async function dragCard(direction) {
  const card = page.locator("div.cursor-grab").first();
  const box = await card.boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + (direction === "right" ? 240 : -240), y, { steps: 12 });
  await page.mouse.up();
}

try {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const f of fs.readdirSync(OUT_DIR)) fs.rmSync(`${OUT_DIR}/${f}`);

  const { data: created, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { business_name: "Sweet Crumb Bakery (matching e2e)" },
  });
  if (error) throw new Error("create user failed: " + error.message);
  userId = created.user.id;
  orgId = (await admin.from("profiles").select("org_id").eq("id", userId).single()).data.org_id;
  const { data: signIn, error: signInErr } = await getAnonClient().auth.signInWithPassword({ email, password });
  if (signInErr) throw new Error("sign-in failed: " + signInErr.message);
  session = signIn.session;
  cookieHeader = `${AUTH_COOKIE_NAME}=${authCookieValue()}`;
  console.log(`Test org ${orgId}, user ${email}`);

  devServer = startDevServer(PORT);
  await waitForServer(BASE_URL, 120_000);

  // ------------------------------------------------------------------ 1
  banner("STAGE 1 — seed ingredients: 1 via POST /api/ingredients, 15 via the backfill script");
  const [viaRoute, ...viaBackfill] = INGREDIENTS;
  const routeRes = await api("POST", "/api/ingredients", viaRoute);
  assert(routeRes.status === 201, `POST /api/ingredients '${viaRoute.name}' -> 201`);
  assert(!("embedding" in routeRes.body.ingredient), "API response omits the 1024-float embedding column");
  const { error: insErr } = await admin.from("ingredients").insert(viaBackfill.map((i) => ({ ...i, org_id: orgId })));
  if (insErr) throw new Error(insErr.message);
  console.log(execFileSync("node", ["scripts/backfill-ingredient-embeddings.mjs", `--org=${orgId}`], { encoding: "utf8" }).trim());

  const { data: seeded } = await admin.from("ingredients").select("name, base_unit, embedding").eq("org_id", orgId).order("name");
  console.log("\n-- ingredients where org_id = test org --");
  for (const s of seeded) console.log(`${s.name.padEnd(28)} ${s.base_unit.padEnd(5)} embedding: ${vectorSummary(s.embedding)}`);
  assert(seeded.length === INGREDIENTS.length, `${INGREDIENTS.length} ingredients stored`);
  assert(seeded.every((s) => s.embedding && JSON.parse(s.embedding).length === 1024), "every ingredient has a 1024-dim embedding");

  // ------------------------------------------------------------------ 2
  banner("STAGE 2 — scan: Claude → vendor → Voyage → match_ingredients → confidence routing");
  const first = await uploadAndScan();
  assert(first.scan.status === 200, "scan route returns 200");
  assert(first.scan.body.matching_error === null, "matching ran without error");
  const { data: inv1 } = await admin.from("invoices").select("status, vendor_id, vendors(name)").eq("id", first.invoiceId).single();
  console.log(`-- invoices row: status='${inv1.status}', vendor_id=${inv1.vendor_id} ('${inv1.vendors?.name}') --`);
  const lines1 = await printLineItems(first.invoiceId, "first scan");

  console.log(`\n-- routing check: auto >= ${AUTO}, needs_review >= ${REVIEW}, else new_ingredient; card hides names < ${DISPLAY} --`);
  const misrouted = [];
  for (const r of lines1) {
    const top = r.candidate_matches?.[0]?.similarity ?? null;
    const want = top === null ? "new_ingredient" : expectedStatus(top);
    if (want !== r.match_status) misrouted.push(r.raw_text);
    console.log(
      `${r.raw_text.padEnd(26)} top ${String(top ?? "—").padEnd(6)} expected ${want.padEnd(14)} got ${r.match_status.padEnd(14)} ` +
        `${want === r.match_status ? "OK " : "BAD"}  card will show: ${expectedCard(r)}`,
    );
  }
  assert(misrouted.length === 0, `every line routed per the thresholds (${misrouted.length} misrouted)`);
  const eggs = lines1.find((r) => r.raw_text === "EGG LG GR AA LSE 15DZ");
  assert(eggs.match_status === "new_ingredient" && eggs.candidate_matches[0].similarity < REVIEW,
    `eggs (top ${eggs.candidate_matches[0].similarity}) routed to new_ingredient, below the ${REVIEW} review bar`);
  assert(lines1.length === 8, "8 line items stored");
  assert(lines1.every((r) => r.embedding && JSON.parse(r.embedding).length === 1024), "every line item has a 1024-dim embedding");
  assert(lines1.every((r) => ["auto_matched", "needs_review", "new_ingredient"].includes(r.match_status)), "every line routed (none left 'pending')");
  assert(inv1.vendor_id !== null, "vendor resolved to a vendors row");
  const unresolved1 = lines1.filter((r) => ["needs_review", "new_ingredient"].includes(r.match_status)).length;
  assert(inv1.status === (unresolved1 > 0 ? "needs_review" : "completed"), `invoice status '${inv1.status}' consistent with ${unresolved1} unresolved line(s)`);

  console.log("\n-- matching quality vs. what each line really is --");
  const findings = [];
  for (const r of lines1) {
    const truth = TRUTH[r.raw_text];
    const top = r.candidate_matches?.[0];
    const topRight = truth ? top?.name === truth : false;
    const inTop3 = truth ? (r.candidate_matches ?? []).some((c) => c.name === truth) : null;
    let verdict;
    if (r.match_status === "auto_matched") {
      verdict = r.ingredients?.name === truth ? "OK  auto-matched correctly" : `BAD auto-matched to ${r.ingredients?.name}, truth ${truth ?? "(not in list)"}`;
      if (r.ingredients?.name !== truth) findings.push(`${r.raw_text}: wrongly auto-matched to ${r.ingredients?.name}`);
    } else if (truth === null) {
      verdict = r.match_status === "new_ingredient"
        ? "OK  flagged new (not in list)"
        : `OK  not in list; sent to review with lookalikes (${(r.candidate_matches ?? []).map((c) => `${c.name} ${c.similarity}`).join(", ")}) for a human to reject`;
    } else if (r.match_status === "new_ingredient") {
      // Below the review bar by design; fine as long as the card still puts
      // the right ingredient in front of the reviewer as a suggestion.
      const surfaced = topRight && top.similarity >= DISPLAY;
      verdict = surfaced
        ? `OK  new_ingredient (top ${top.similarity} < ${REVIEW}) but card still suggests ${truth}`
        : `BAD missed: ${truth} is in the list but the card won't suggest it (top ${top?.name} ${top?.similarity})`;
      if (!surfaced) findings.push(`${r.raw_text}: '${truth}' is in the list but not suggested on its card`);
    } else {
      verdict = `${topRight ? "OK " : "meh"} review: truth ${truth} is ${topRight ? "top candidate" : inTop3 ? "in top 3, not first" : "NOT in top 3"}`;
      if (!inTop3) findings.push(`${r.raw_text}: correct ingredient '${truth}' not in top 3`);
    }
    console.log(`${r.raw_text.padEnd(26)} ${verdict}`);
  }
  assert(findings.length === 0, `matching quality: no wrong auto-matches, every in-list item suggested, truth always in top 3 (${findings.length} finding(s))`);

  // ------------------------------------------------------------------ 3
  banner("STAGE 3 — §6.3 review gate");
  const { error: gateErr } = await admin.from("invoices").update({ status: "completed" }).eq("id", first.invoiceId);
  console.log(`UPDATE invoices SET status='completed' (service role, bypasses RLS) -> ${gateErr ? `ERROR: ${gateErr.message}` : "succeeded"}`);
  assert(gateErr && /unreviewed line items/.test(gateErr.message), "DB trigger refuses 'completed' while lines are unresolved — no code path around it");

  await admin.from("organizations").update({ max_unreviewed_line_items: 1 }).eq("id", orgId);
  console.log(`org max_unreviewed_line_items temporarily set to 1 (unresolved now: ${unresolved1})`);
  await openBrowser();
  await page.goto(`${BASE_URL}/dashboard`);
  const gate = page.getByRole("alertdialog");
  await gate.waitFor({ timeout: 30_000 });
  console.log(`GET /dashboard -> interstitial text: "${(await gate.innerText()).replace(/\s+/g, " ").trim()}"`);
  await screenshot("action-required-interstitial");
  assert(await gate.isVisible(), "Action Required interstitial covers the dashboard");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert(overflow <= 0, `no sideways scroll at phone width, so the gate covers the whole page (overflow ${overflow}px)`);
  await page.goto(`${BASE_URL}/review`);
  await page.getByRole("heading", { name: "Review queue" }).waitFor();
  assert((await page.getByRole("alertdialog").count()) === 0, "…but not the review queue it sends you to");
  await screenshot("review-queue-while-blocked");
  const blocked = await api("POST", "/api/invoices", { id: crypto.randomUUID(), file_storage_path: `${orgId}/x.jpg`, file_type: "image" });
  console.log(`POST /api/invoices while over cap -> HTTP ${blocked.status} ${JSON.stringify(blocked.body)}`);
  assert(blocked.status === 423, "new scans refused with 423 while over the cap");
  await admin.from("organizations").update({ max_unreviewed_line_items: 15 }).eq("id", orgId);
  console.log("cap restored to 15");

  // ------------------------------------------------------------------ 4
  banner("STAGE 4 — swipe-to-verify in the real UI (headless Edge, real pointer drags)");
  await page.goto(`${BASE_URL}/invoices/${first.invoiceId}/review`);
  await page.getByRole("heading", { name: "Review matches" }).waitFor();
  await screenshot("review-start");
  assert((await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0,
    "review screen fits a phone-width viewport");

  const actions = { dragRight: 0, dragLeft: 0, created: 0, picked: 0 };
  const firstCardShown = {}; // raw_text -> what its card showed the first time
  for (let step = 0; step < 30; step++) {
    if (await page.getByText("All caught up").count()) break;
    const card = page.locator("div.cursor-grab").first();
    await card.waitFor();
    const rawText = (await card.locator("p.text-lg").innerText()).trim();
    const nameEl = card.getByTestId("candidate-name");
    const candidate = (await nameEl.count()) ? (await nameEl.innerText()).trim() : null;
    const cardText = (await card.locator("div.rounded-xl").innerText()).replace(/\s+/g, " ").trim();
    const truth = TRUTH[rawText];
    if (!(rawText in firstCardShown)) firstCardShown[rawText] = cardText;
    console.log(`\ncard: "${rawText}" shows [${cardText}]; truth: ${truth ?? "(new ingredient)"}`);

    // Generous timeout: create-ingredient embeds via Voyage, and on the
    // 3-RPM no-payment-method tier a 429 retry alone waits 21s+.
    const lineApi = (path) =>
      page.waitForResponse((r) => r.url().includes("/api/line-items/") && r.url().endsWith(path), { timeout: 150_000 });
    if (candidate && candidate === truth) {
      console.log("-> drag RIGHT (confirm)");
      const done = lineApi("/confirm");
      await dragCard("right");
      await done;
      actions.dragRight++;
    } else if (candidate) {
      console.log("-> drag LEFT (not this)");
      const done = lineApi("/reject");
      await dragCard("left");
      await done;
      actions.dragLeft++;
    } else if (truth === null) {
      const spec = NEW_INGREDIENTS[rawText];
      console.log(`-> tap "Create new", create '${spec.name}' (${spec.base_unit})`);
      await card.getByRole("button", { name: "Create new" }).click();
      await page.getByLabel("Ingredient name").fill(spec.name);
      await page.getByLabel("Base unit (what you cost it in)").fill(spec.base_unit);
      await page.getByLabel("Category (optional)").fill(spec.category);
      await screenshot(`create-form-${spec.name.toLowerCase().replace(/\W+/g, "-")}`);
      const done = lineApi("/create-ingredient");
      await page.getByRole("button", { name: "Add & match" }).click();
      await done;
      actions.created++;
    } else {
      console.log(`-> no candidate left; pick '${truth}' from the list`);
      const done = lineApi("/confirm");
      await page.getByLabel("Search your ingredients").selectOption({ label: truth });
      await done;
      actions.picked++;
    }
    await page.waitForTimeout(450); // let the next card render
    await screenshot(`after-${rawText.toLowerCase().replace(/\W+/g, "-").slice(0, 24)}`);
  }
  assert(await page.getByText("All caught up").count(), "review queue emptied through the UI");
  console.log("\n-- what each card showed on first appearance --");
  for (const [raw, shown] of Object.entries(firstCardShown)) console.log(`${raw.padEnd(26)} [${shown}]`);
  const eggsCard = firstCardShown["EGG LG GR AA LSE 15DZ"];
  assert(/^Low confidence/i.test(eggsCard) && /Large Eggs/.test(eggsCard),
    `eggs card (new_ingredient, between ${DISPLAY} and ${REVIEW}) shows 'Large Eggs' flagged as low confidence`);
  for (const raw of ["VANILLA XTRCT PURE 32OZ", "CRM HVY 40% 12/QT"]) {
    assert(/^No match found/.test(firstCardShown[raw]) && !/% similar/.test(firstCardShown[raw]),
      `${raw} card shows 'No match found' and no candidate name`);
  }
  console.log(`UI actions taken: ${JSON.stringify(actions)}`);
  assert(actions.dragRight >= 1, "at least one card confirmed by a real right-drag");
  assert(actions.dragLeft >= 1, "at least one wrong candidate rejected by a real left-drag");

  await page.goto(`${BASE_URL}/invoices/${first.invoiceId}`);
  await page.getByRole("table").waitFor();
  await screenshot("invoice-detail-after-review");

  const linesAfter = await printLineItems(first.invoiceId, "after UI review");
  assert(linesAfter.every((r) => ["auto_matched", "confirmed"].includes(r.match_status)), "every line is now auto_matched or confirmed");
  assert(linesAfter.every((r) => r.ingredients?.name === (TRUTH[r.raw_text] ?? NEW_INGREDIENTS[r.raw_text].name)),
    "every line is matched to the right ingredient");
  const { data: invAfter } = await admin.from("invoices").select("status").eq("id", first.invoiceId).single();
  console.log(`-- invoices row after review: status='${invAfter.status}' --`);
  assert(invAfter.status === "completed", "invoice reached 'completed' once nothing was unresolved");

  const { data: aliases } = await admin
    .from("vendor_ingredient_aliases")
    .select("vendor_id, raw_text_normalized, times_used, confirmed_by, ingredients(name)")
    .eq("org_id", orgId)
    .order("created_at");
  console.log("\n-- vendor_ingredient_aliases where org_id = test org --");
  for (const a of aliases) console.log(`vendor ${a.vendor_id.slice(0, 8)}… '${a.raw_text_normalized}' -> ${a.ingredients.name} (times_used ${a.times_used}, confirmed_by ${a.confirmed_by.slice(0, 8)}…)`);
  const { data: newIngs } = await admin
    .from("ingredients").select("name, base_unit, category, embedding").eq("org_id", orgId)
    .in("name", Object.values(NEW_INGREDIENTS).map((n) => n.name));
  console.log("\n-- ingredients created from the review UI --");
  for (const n of newIngs) console.log(`${n.name} (${n.base_unit}, ${n.category}) embedding: ${vectorSummary(n.embedding)}`);
  const expectedNew = Object.keys(NEW_INGREDIENTS).length;
  assert(newIngs.length === expectedNew && newIngs.every((n) => n.embedding), `all ${expectedNew} new ingredients created with embeddings`);

  // ------------------------------------------------------------------ 5
  banner("STAGE 5 — re-scan the same invoice: remembered phrasings take the alias fast path");
  const second = await uploadAndScan();
  const lines2 = await printLineItems(second.invoiceId, "re-scan");
  const aliasTexts = new Set(aliases.map((a) => a.raw_text_normalized));
  const viaAlias = lines2.filter((r) => aliasTexts.has(normalize(r.raw_text)));
  assert(viaAlias.length === aliases.length, `all ${aliases.length} remembered phrasings appear on the re-scan`);
  assert(viaAlias.every((r) => r.match_status === "auto_matched" && Number(r.match_confidence) === 1 && r.candidate_matches === null),
    "each auto-matched at confidence 1.0 with no vector candidates (alias hit, not a vector search)");
  const { data: inv2 } = await admin.from("invoices").select("status").eq("id", second.invoiceId).single();
  console.log(`-- re-scanned invoice status: '${inv2.status}' --`);
  assert(inv2.status === "completed", "re-scanned invoice needs no review at all");
  const { data: aliasesAfter } = await admin.from("vendor_ingredient_aliases").select("raw_text_normalized, times_used").eq("org_id", orgId).order("created_at");
  console.log("-- vendor_ingredient_aliases.times_used after re-scan --");
  for (const a of aliasesAfter) console.log(`'${a.raw_text_normalized}' times_used ${a.times_used}`);

  banner(findings.length ? `FINDINGS (${findings.length})` : "FINDINGS: none");
  for (const f of findings) console.log(`- ${f}`);
  console.log("\nMatching end-to-end test passed.");
} finally {
  if (browser) await browser.close();
  killDevServer(devServer);
  if (process.env.KEEP_FIXTURES === "1") {
    console.log(`\nKEEP_FIXTURES=1 — left in Supabase: org ${orgId}, user ${email}, invoices ${invoiceIds.join(", ")}`);
  } else {
    console.log("\nCleaning up test fixtures...");
    if (uploadedPaths.length) await admin.storage.from("invoices").remove(uploadedPaths);
    if (orgId) await admin.from("organizations").delete().eq("id", orgId); // cascades every org-scoped row
    if (userId) await admin.auth.admin.deleteUser(userId);
    console.log("Cleanup done.");
  }
}
