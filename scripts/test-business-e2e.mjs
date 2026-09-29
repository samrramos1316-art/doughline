// Runs a whole small business through DoughTally, in a real browser, the way
// its owner would — against the live site by default (real Claude, Voyage,
// Supabase). Paperwork comes from scripts/make-business-fixtures.mjs.
//
//   1. Sign up "Maple & Rye Bakery" through the signup form.
//   2. Import the owner's ingredient spreadsheet (CSV) on /ingredients.
//   3. Build 5 recipes in the recipe grid, then 5 menu items.
//   4. Dashboard margins vs. a hand calculation from the same numbers.
//   5. Backfill July/August invoices (bulk import) and review them: prices go
//      into history only — today's costs don't move, no alerts.
//   6. This week: the 2-page distributor PDF, a packaging invoice and a blurry
//      receipt (bulk import); the dairy invoice photographed on a phone
//      (/invoices/scan). Review everything the way the owner would: confirm
//      right matches, correct wrong ones, create new packaging ingredients,
//      skip gloves and sanitizer. Type the unreadable receipt in by hand.
//   7. Check every ingredient cost, every price alert and its margin impacts,
//      the dashboard, the menu, Market Watch and the CSV export against the
//      numbers on the paper.
//
// Findings are collected rather than stopping at the first one; the run
// ends with the full list. Screenshots: test-output/business/.
// Run: node scripts/test-business-e2e.mjs [--base=http://localhost:3000] [--keep]
import fs from "node:fs";
import { chromium } from "playwright-core";
import { loadEnv, getAdminClient } from "./lib/supabaseTestEnv.mjs";
import { execFileSync } from "node:child_process";
import { BUSINESS, INGREDIENTS, RECIPES, MENU, INVOICES } from "./fixtures/maple-rye/data.mjs";

loadEnv();
// Invoice dates follow today, so render this run's paperwork first.
execFileSync(process.execPath, ["scripts/make-business-fixtures.mjs"], { stdio: "inherit" });
const BASE = process.argv.find((a) => a.startsWith("--base="))?.slice(7) ?? "https://doughtally.app";
const KEEP = process.argv.includes("--keep");
const OUT = "test-output/business";
const FIX = "scripts/fixtures/maple-rye";
const admin = getAdminClient();
const email = `maple-rye-${Date.now()}@example.com`;
const password = "Maple-and-Rye-2026!";
const results = [];
const log = (...a) => console.log(...a);
const banner = (t) => log(`\n=== ${t} ===`);
let shot = 0;
const snap = async (page, name, full = true) => page.screenshot({ path: `${OUT}/${String(++shot).padStart(2, "0")}-${name}.png`, fullPage: full });
function check(ok, msg, detail) {
  results.push({ ok: !!ok, msg, detail });
  log(`${ok ? "PASS" : "FAIL"}: ${msg}${detail && !ok ? `\n      ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
}
const r4 = (n) => Math.round(n * 10000) / 10000;
const close = (a, b, tol = 0.00015) => a != null && b != null && Math.abs(Number(a) - Number(b)) <= tol;

// ---- the numbers on the paper -------------------------------------------
const startCost = Object.fromEntries(INGREDIENTS.map(([n, , , c]) => [n, c]));
const allLines = INVOICES.flatMap((inv) => inv.lines.map((l) => ({ inv, item: l[0], desc: l[1], qty: l[2], unit: l[3], price: l[4], ...l[5] })));
const thisWeek = allLines.filter((l) => l.inv.batch !== "backfill");
const finalCost = { ...startCost };
for (const l of thisWeek) {
  if (l.ingredient) finalCost[l.ingredient] = l.base;
  if (l.create) finalCost[l.create[0]] = l.base;
}
function margins(costs) {
  return Object.fromEntries(MENU.map(([item, recipeName, price]) => {
    const r = RECIPES.find((x) => x.name === recipeName);
    const batch = r.lines.reduce((s, [ing, q]) => s + q * costs[ing], 0);
    const cps = batch / r.yield[0];
    return [item, { cps, pct: Math.round(((price - cps) / price) * 10000) / 100, price }];
  }));
}
const startMargins = margins(startCost);

// Which paper line is this card? Best token overlap with the printed text.
const tokens = (s) => new Set(String(s).toUpperCase().replace(/[^A-Z0-9/%.]+/g, " ").split(" ").filter((t) => t.length > 1));
function lineFor(rawText) {
  const t = tokens(rawText);
  let best = null, score = 0;
  for (const l of allLines) {
    const lt = tokens(l.desc);
    const s = [...lt].filter((x) => t.has(x)).length / Math.max(lt.size, 1);
    if (s > score) { score = s; best = l; }
  }
  return score >= 0.5 ? best : null;
}

// ---- review deck driver ---------------------------------------------------
const reviewLog = [];
async function cardState(page) {
  const quick = { timeout: 1500 };
  if (await page.getByText("All caught up").isVisible().catch(() => false)) return { done: true };
  if (await page.getByRole("button", { name: "Add & match" }).isVisible().catch(() => false)) return { form: true };
  const card = page.locator("div.cursor-grab").last();
  const raw = await card.locator("p.text-lg").innerText(quick).catch(() => null);
  const cand = await card.getByTestId("candidate-name").innerText(quick).catch(() => null);
  const sim = cand ? await card.locator("p", { hasText: "% similar" }).innerText(quick).catch(() => "") : "";
  const pos = await page.locator("p", { hasText: / of \d+/ }).first().innerText(quick).catch(() => "");
  return { raw, cand, sim, pos };
}
const sig = (s) => JSON.stringify(s);
async function waitChange(page, before, timeout = 60_000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    await page.waitForTimeout(400);
    const now = await cardState(page);
    if (now.raw === null && !now.done && !now.form) continue; // mid-transition
    if (sig(now) !== sig(before) && !(await page.locator("button:disabled", { hasText: /Confirm|Not this|Create new|Skip for now/ }).count())) return now;
  }
  throw new Error(`review card didn't change after an action: ${sig(before)}`);
}
async function reviewAll(page, label) {
  await page.goto(`${BASE}/review`);
  await page.getByRole("heading", { name: "Match invoice lines" }).waitFor();
  await snap(page, `${label}-review-start`, false);
  let state = await cardState(page);
  let guard = 0;
  while (!state.done && guard++ < 80) {
    const line = lineFor(state.raw);
    const entry = { raw: state.raw, suggested: state.cand, similarity: state.sim, expected: line ? line.ingredient ?? (line.create ? `new: ${line.create[0]}` : "skip") : "??" };
    if (!line) {
      entry.action = "unrecognised → skip";
      await page.getByRole("button", { name: state.cand ? "Not this" : "Skip for now" }).click();
    } else if (line.ingredient) {
      if (state.cand === line.ingredient) {
        entry.action = "confirm suggestion";
        await page.getByRole("button", { name: "Confirm" }).click();
      } else {
        entry.action = state.cand ? `suggestion wrong → picked "${line.ingredient}" from search` : `no suggestion → picked "${line.ingredient}" from search`;
        await page.getByLabel("Search your ingredients").selectOption({ label: line.ingredient });
      }
    } else if (line.create) {
      if (state.cand) {
        entry.action = "reject suggestion";
        await page.getByRole("button", { name: "Not this" }).click();
        reviewLog.push(entry);
        state = await waitChange(page, state);
        continue;
      }
      entry.action = `create "${line.create[0]}"`;
      await page.getByRole("button", { name: "Create new" }).click();
      await page.getByRole("button", { name: "Add & match" }).waitFor();
      await page.getByLabel("Ingredient name").fill(line.create[0]);
      await page.getByLabel(/Base unit/).fill(line.create[1]);
      await page.getByLabel(/Category/).fill(line.create[2]);
      await page.getByRole("button", { name: "Add & match" }).click();
      state = { form: true };
    } else {
      entry.action = "not an ingredient";
      await page.getByRole("button", { name: /^Not an ingredient/ }).click();
    }
    reviewLog.push(entry);
    log(`  [${label}] ${entry.raw}  →  suggested ${entry.suggested ?? "nothing"} ${entry.similarity}  →  ${entry.action}`);
    const err = await page.locator("p.text-red-600").innerText().catch(() => "");
    if (err) check(false, `review action failed on "${entry.raw}"`, err);
    state = await waitChange(page, state);
  }
  await snap(page, `${label}-review-done`, false);
  return reviewLog;
}

async function bulkImport(page, files, label) {
  await page.goto(`${BASE}/invoices/import`);
  await page.getByLabel("Choose invoice files").setInputFiles(files.map((f) => `${FIX}/${f}`));
  await page.getByRole("button", { name: /^Import \d+ files?$/ }).click();
  const t0 = Date.now();
  await page.waitForFunction(
    (n) => [...document.querySelectorAll("[data-testid=import-item]")].filter((e) => ["needs_review", "completed", "failed", "not_invoice", "error"].includes(e.dataset.status)).length >= n,
    files.length,
    { timeout: 15 * 60_000, polling: 1000 },
  );
  const items = await page.locator("[data-testid=import-item]").evaluateAll((els) => els.map((e) => ({ status: e.dataset.status, text: e.innerText.replace(/\s+/g, " ") })));
  log(`  ${label}: ${Math.round((Date.now() - t0) / 1000)}s`);
  for (const it of items) log(`   · ${it.text}`);
  await snap(page, `${label}-imported`, false);
  return items;
}

const browser = await chromium.launch({ channel: "msedge", headless: true });
let userId, orgId;
try {
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of fs.readdirSync(OUT)) fs.rmSync(`${OUT}/${f}`);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60_000);

  banner("1. sign up");
  await page.goto(`${BASE}/signup`);
  await page.getByLabel("Business name").fill(BUSINESS.name);
  await page.getByLabel("What kind of business?").selectOption(BUSINESS.type);
  await page.getByLabel("Your name").fill(BUSINESS.owner);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.locator("#acceptTerms").check();
  await page.getByRole("button", { name: /sign up|create/i }).click();
  // New signups land on the menu/recipe import (§9.3); this owner types
  // theirs in by hand, so they skip it.
  await page.waitForURL(/\/onboarding\/import\?welcome=1/, { timeout: 60_000 });
  await page.getByRole("link", { name: "Skip — I'll enter these manually" }).click();
  await page.waitForURL(/\/recipes$/);
  const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
  userId = users.users.find((u) => u.email === email).id;
  orgId = (await admin.from("profiles").select("org_id").eq("id", userId).single()).data.org_id;
  check(true, `signed up as ${email} → the import screen → skipped to Recipes`);
  await snap(page, "empty-dashboard", false);

  banner("2. ingredient spreadsheet");
  await page.goto(`${BASE}/ingredients`);
  await page.getByLabel("Import ingredients CSV").setInputFiles(`${FIX}/ingredients.csv`);
  const importMsg = await page.getByRole("status").filter({ hasText: /Saved|failed|Row/ }).innerText({ timeout: 120_000 });
  log(`  ${importMsg}`);
  check(/14 added/.test(importMsg), "CSV import adds all 14 ingredients", importMsg);
  await page.waitForTimeout(1500);
  await snap(page, "ingredients");

  banner("3. recipes and menu");
  for (const r of RECIPES) {
    await page.goto(`${BASE}/recipes`);
    await page.locator('input[name="name"]').fill(r.name);
    await page.locator('input[name="batch_yield_qty"]').fill(String(r.yield[0]));
    await page.locator('input[name="batch_yield_unit"]').fill(r.yield[1]);
    await page.getByRole("button", { name: "Create recipe" }).click();
    await page.waitForURL(/\/recipes\/[0-9a-f-]{36}$/);
    for (const [i, [ing, q]] of r.lines.entries()) {
      await page.getByLabel(`Ingredient, row ${i + 1}`).selectOption({ label: ing });
      await page.getByLabel(`Quantity, row ${i + 1}`).fill(String(q));
    }
    await page.getByRole("button", { name: "Save recipe" }).click();
    await page.waitForFunction(() => /\$\d+\.\d{4}/.test(document.body.innerText), null, { timeout: 30_000 });
    const shown = await page.locator("p", { hasText: /^\$\d+\.\d{4}$/ }).first().innerText();
    const expected = r.lines.reduce((s, [ing, q]) => s + q * startCost[ing], 0) / r.yield[0];
    check(close(shown.slice(1), expected, 0.0001), `${r.name}: cost per serving ${shown} (hand: $${expected.toFixed(4)})`, { shown, expected });
  }
  await snap(page, "recipe-last");
  await page.goto(`${BASE}/menu`);
  for (const [item, recipe, price] of MENU) {
    await page.locator("#menu-name").fill(item);
    await page.locator('select[name="recipe_id"]').selectOption({ label: recipe });
    await page.locator('input[name="selling_price"]').fill(String(price));
    await page.getByRole("button", { name: "Add menu item" }).click();
    await page.locator("tbody").getByText(item, { exact: true }).waitFor();
  }
  await snap(page, "menu");

  banner("4. dashboard vs. hand calculation");
  await page.goto(`${BASE}/dashboard`);
  const cardsText = await page.locator("main").innerText();
  for (const [item, m] of Object.entries(startMargins)) {
    check(cardsText.includes(item) && cardsText.includes(`${m.pct.toFixed(1)}%`), `dashboard: ${item} ${m.pct.toFixed(1)}% margin (cost $${m.cps.toFixed(2)}, sells $${m.price.toFixed(2)})`);
  }
  await snap(page, "dashboard-start");

  banner("5. backfill: July + August invoices");
  const backfill = await bulkImport(page, ["01-lone-star-backfill.pdf", "02-hill-country-backfill.pdf"], "backfill");
  check(backfill.every((i) => ["needs_review", "completed"].includes(i.status)), "both old invoices read", backfill);
  await reviewAll(page, "backfill");
  const { data: afterBackfill } = await admin.from("ingredients").select("name, current_unit_cost").eq("org_id", orgId);
  const moved = afterBackfill.filter((i) => startCost[i.name] != null && !close(i.current_unit_cost, startCost[i.name]));
  check(moved.length === 0, "old invoices don't overwrite today's costs", moved);
  const { count: alertsAfterBackfill } = await admin.from("price_alerts").select("id", { count: "exact", head: true }).eq("org_id", orgId);
  check(alertsAfterBackfill === 0, "old invoices raise no price alerts", { alertsAfterBackfill });
  const { data: hist } = await admin.from("ingredient_price_history").select("unit_cost, effective_date, source, ingredients(name)").eq("org_id", orgId).eq("source", "invoice_scan");
  for (const l of allLines.filter((x) => x.inv.batch === "backfill")) {
    const h = hist.find((x) => x.ingredients.name === l.ingredient && x.effective_date === l.inv.date);
    check(h && close(h.unit_cost, l.base), `history: ${l.ingredient} $${l.base} on ${l.inv.date} (${l.desc})`, h ?? "missing");
  }

  banner("6a. this week: distributor PDF, packaging invoice, blurry receipt");
  const week = await bulkImport(page, ["03-lone-star-this-week.pdf", "05-bakers-box-this-week.pdf", "06-restaurant-depot-receipt-blurry.jpg"], "this-week");
  const byName = (f) => week.find((w) => w.text.includes(f));
  check(/\b11 lines\b/.test(byName("03-lone-star").text), "2-page PDF: all 11 lines read, across both pages", byName("03-lone-star").text);
  check(byName("06-restaurant").status === "failed" && /Enter by hand/.test(byName("06-restaurant").text), "blurry receipt → Couldn't read it + Enter by hand", byName("06-restaurant").text);

  banner("6b. phone: photo of the dairy invoice");
  const phoneCtx = await browser.newContext({ storageState: await ctx.storageState(), viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const phone = await phoneCtx.newPage();
  phone.setDefaultTimeout(60_000);
  await phone.goto(`${BASE}/invoices/scan`);
  await phone.locator('input[type=file][capture]').setInputFiles(`${FIX}/04-hill-country-phone-photo.jpg`);
  await phone.getByRole("button", { name: "Use this photo" }).click();
  await phone.waitForURL(/\/invoices\/[0-9a-f-]{36}(\/review)?$/, { timeout: 5 * 60_000 });
  await phone.waitForLoadState("networkidle");
  await phone.screenshot({ path: `${OUT}/${String(++shot).padStart(2, "0")}-phone-dairy-invoice.png`, fullPage: true });
  const phoneUrl = phone.url();
  log(`  photo → ${phoneUrl.replace(BASE, "")}`);
  check(!phoneUrl.endsWith("/review"), "dairy photo: every line auto-matched from last month's confirmations (no review needed)", phoneUrl);

  banner("6c. review this week's lines");
  await reviewAll(page, "this-week");

  banner("6d. type the unreadable receipt in by hand");
  const { data: rdInv } = await admin.from("invoices").select("id, status").eq("org_id", orgId).eq("status", "failed");
  check(rdInv.length === 1, "exactly one invoice failed (the receipt)", rdInv);
  const receipt = INVOICES.find((i) => i.kind === "blurry");
  await page.goto(`${BASE}/invoices/${rdInv[0].id}/manual-entry`);
  await page.getByLabel("Vendor").fill(receipt.vendor.name);
  await page.getByLabel("Invoice #").fill(receipt.number);
  await page.getByLabel("Invoice date").fill(receipt.date);
  for (const [i, l] of receipt.lines.entries()) {
    const row = i + 1;
    await page.getByLabel(`Item (as printed), row ${row}`, { exact: true }).fill(l[1]);
    await page.getByLabel(`Qty, row ${row}`, { exact: true }).fill(String(l[2]));
    await page.getByLabel(`Unit, row ${row}`, { exact: true }).fill(l[3]);
    await page.getByLabel(`Unit price, row ${row}`, { exact: true }).fill(String(l[4]));
    await page.getByLabel(`Pack size, row ${row}`, { exact: true }).fill(String(l[5].pack[0]));
    await page.getByLabel(`Pack unit, row ${row}`, { exact: true }).fill(l[5].pack[1]);
    await page.getByLabel(`Line total, row ${row}`, { exact: true }).fill(String(l[2] * l[4]));
  }
  await page.getByRole("button", { name: "Save lines" }).click();
  const manualMsg = await page.getByRole("status").filter({ hasText: /Saved|fail|Fix/ }).innerText({ timeout: 120_000 });
  log(`  ${manualMsg}`);
  check(/Saved/.test(manualMsg), "hand-typed receipt saved and matched", manualMsg);
  await snap(page, "manual-entry");
  await reviewAll(page, "receipt");

  banner("6e. a second delivery from the distributor");
  const repeat = await bulkImport(page, ["07-lone-star-top-up.pdf"], "repeat");
  check(repeat[0].status === "completed", "same-day top-up from the distributor needs no review: butter matched, gloves and sanitizer remembered as not ingredients", repeat[0].text);
  const { data: remembered } = await admin
    .from("invoice_line_items")
    .select("raw_text, match_status, invoices!inner(invoice_number)")
    .eq("org_id", orgId)
    .eq("invoices.invoice_number", "LSF-122310");
  log(`  ${remembered.map((l) => `${l.raw_text}: ${l.match_status}`).join(" | ")}`);
  check(remembered.filter((l) => l.match_status === "not_ingredient").length === 2, "gloves and sanitizer cleared automatically as not ingredients", remembered);

  banner("7. what the business sees now");
  const { data: ings } = await admin.from("ingredients").select("name, base_unit, category, current_unit_cost").eq("org_id", orgId).order("name");
  for (const [name, cost] of Object.entries(finalCost)) {
    const row = ings.find((i) => i.name === name);
    check(row && close(row.current_unit_cost, cost), `cost: ${name} $${r4(cost)}/${row?.base_unit ?? "?"}${startCost[name] != null && startCost[name] !== cost ? ` (was $${startCost[name]})` : ""}`, row ?? "missing");
  }
  const created = ings.filter((i) => startCost[i.name] == null).map((i) => `${i.name} (${i.base_unit}, ${i.category})`);
  check(created.length === 3, `new packaging ingredients created from the packaging invoice: ${created.join(", ")}`, created);

  const expectAlerts = Object.keys(finalCost).filter((n) => startCost[n] != null && Math.abs((finalCost[n] - startCost[n]) / startCost[n]) * 100 > 8);
  const { data: alerts } = await admin
    .from("price_alerts")
    .select("id, pct_change, previous_unit_cost, new_unit_cost, ingredients(name), menu_item_margin_impacts(previous_margin_pct, new_margin_pct, menu_items(name))")
    .eq("org_id", orgId);
  check(alerts.length === expectAlerts.length && expectAlerts.every((n) => alerts.some((a) => a.ingredients.name === n)),
    `price alerts for exactly the moves over 8%: ${expectAlerts.join(", ")}`, alerts.map((a) => `${a.ingredients.name} ${a.pct_change}%`));
  // Walk the alerts in the order they were applied: each one's "before" is
  // the costs as they stood just before that line was confirmed.
  for (const a of alerts) {
    const name = a.ingredients.name;
    const pct = Math.round(((finalCost[name] - startCost[name]) / startCost[name]) * 10000) / 100;
    check(close(a.pct_change, pct, 0.01), `alert: ${name} $${a.previous_unit_cost} → $${a.new_unit_cost} (${a.pct_change}%, hand ${pct}%)`);
    const users = MENU.filter(([, rn]) => RECIPES.find((r) => r.name === rn).lines.some(([i]) => i === name)).map(([m]) => m).sort();
    const got = a.menu_item_margin_impacts.map((i) => i.menu_items.name).sort();
    check(JSON.stringify(got) === JSON.stringify(users), `  affects exactly: ${users.join(", ")}`, got);
    for (const imp of a.menu_item_margin_impacts) {
      const drop = Number(imp.previous_margin_pct) - Number(imp.new_margin_pct);
      const [, rn, price] = MENU.find(([m]) => m === imp.menu_items.name);
      const q = RECIPES.find((r) => r.name === rn);
      const qty = q.lines.find(([i]) => i === name)[1];
      const handDrop = ((qty * (finalCost[name] - startCost[name])) / q.yield[0] / price) * 100;
      check(Math.abs(drop - handDrop) < 0.011, `  ${imp.menu_items.name}: ${imp.previous_margin_pct}% → ${imp.new_margin_pct}% (−${drop.toFixed(2)}pp, hand −${handDrop.toFixed(2)}pp)`);
    }
  }
  const butter = alerts.find((a) => a.ingredients.name === "Unsalted Butter");
  if (butter) {
    await page.goto(`${BASE}/alerts/${butter.id}`);
    await page.getByText("Menu items affected").waitFor();
    await page.waitForFunction(() => /suggest/i.test(document.body.innerText), null, { timeout: 90_000 }).catch(() => {});
    // Claude writes the summary on first view; wait for it rather than a fixed time.
    await page.getByTestId("ai-narrative").waitFor({ timeout: 90_000 }).catch(() => {});
    const text = await page.locator("main").innerText();
    await snap(page, "alert-butter");
    check(/suggest/i.test(text), "butter alert page shows suggestions");
    const { data: narr } = await admin.from("price_alerts").select("ai_narrative").eq("id", butter.id).single();
    log(`  Claude's summary: ${narr.ai_narrative ?? "(none)"}`);
    check(!!narr.ai_narrative, "butter alert has Claude's plain-English summary");
  }
  await page.goto(`${BASE}/alerts`);
  await snap(page, "alerts");

  const endMargins = margins(finalCost);
  await page.goto(`${BASE}/dashboard`);
  await page.waitForLoadState("networkidle");
  const endText = await page.locator("main").innerText();
  const { data: mv } = await admin.from("menu_item_margins").select("name, cost_per_serving, margin_pct").eq("org_id", orgId);
  for (const [item, m] of Object.entries(endMargins)) {
    const row = mv.find((x) => x.name === item);
    check(close(row.margin_pct, m.pct, 0.011) && endText.includes(`${m.pct.toFixed(1)}%`),
      `dashboard now: ${item} ${m.pct.toFixed(1)}% (was ${startMargins[item].pct.toFixed(1)}%; cost $${m.cps.toFixed(4)})`, { db: row, hand: m });
  }
  await snap(page, "dashboard-end");
  await phone.goto(`${BASE}/dashboard`);
  await phone.screenshot({ path: `${OUT}/${String(++shot).padStart(2, "0")}-phone-dashboard.png`, fullPage: true });
  await phone.goto(`${BASE}/market`);
  const marketText = await phone.locator("main").innerText();
  await phone.screenshot({ path: `${OUT}/${String(++shot).padStart(2, "0")}-phone-market.png`, fullPage: true });
  check(/butter/i.test(marketText) && /egg/i.test(marketText), "Market Watch links the bakery's butter and eggs to USDA prices");

  const { data: invs } = await admin.from("invoices").select("invoice_number, invoice_date, status, vendors(name), invoice_line_items(match_status)").eq("org_id", orgId).order("invoice_date");
  for (const inv of invs) {
    const counts = inv.invoice_line_items.reduce((m, l) => ((m[l.match_status] = (m[l.match_status] ?? 0) + 1), m), {});
    log(`  ${inv.invoice_date} ${inv.vendors?.name} ${inv.invoice_number}: ${inv.status} ${JSON.stringify(counts)}`);
  }
  const auto = await admin.from("invoice_line_items").select("raw_text, match_status, invoices!inner(invoice_number)").eq("org_id", orgId).eq("invoices.invoice_number", "LSF-121877");
  const learned = auto.data.filter((l) => l.match_status === "auto_matched").length;
  check(learned >= 6, `distributor's September invoice: ${learned} of 11 lines matched automatically from July's confirmations`, auto.data.map((l) => `${l.raw_text}: ${l.match_status}`));
  const open = invs.filter((i) => i.status !== "completed").map((i) => `${i.vendors?.name} ${i.invoice_number}: ${i.status}`);
  check(open.length === 0, "every invoice finished (completed)", open);
  await page.goto(`${BASE}/invoices`);
  await snap(page, "invoices");

  const dl = page.waitForEvent("download");
  await page.goto(`${BASE}/ingredients`);
  await page.getByRole("link", { name: "Export CSV" }).click();
  const csv = fs.readFileSync(await (await dl).path(), "utf8");
  fs.writeFileSync(`${OUT}/ingredients-export.csv`, csv);
  const butterRow = csv.split("\n").find((l) => l.includes("Unsalted Butter"));
  check(butterRow && butterRow.includes("4.19"), `CSV export has today's butter price: ${butterRow}`);
} catch (err) {
  check(false, "run stopped early", err.stack?.split("\n").slice(0, 4).join(" | "));
} finally {
  await browser.close();
  fs.writeFileSync(`${OUT}/review-decisions.json`, JSON.stringify(reviewLog, null, 2));
  const failed = results.filter((r) => !r.ok);
  log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  for (const f of failed) log(`  FAIL: ${f.msg}${f.detail ? `\n        ${typeof f.detail === "string" ? f.detail : JSON.stringify(f.detail)}` : ""}`);
  fs.writeFileSync(`${OUT}/results.json`, JSON.stringify({ email, orgId, results }, null, 2));
  if (KEEP) log(`\nKept the account: ${email} / ${password}`);
  else if (userId) {
    if (orgId) await admin.from("organizations").delete().eq("id", orgId);
    await admin.auth.admin.deleteUser(userId);
    log("test business deleted");
  }
}
