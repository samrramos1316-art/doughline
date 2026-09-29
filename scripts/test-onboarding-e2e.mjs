// §9.3 onboarding import, end to end in a real browser (real Claude + Voyage):
//
//   1. A new signup lands on /onboarding/import?welcome=1; "Skip" goes to
//      manual entry. Logging in later goes to the dashboard (shown once).
//   2. With the owner's price list loaded, "Import recipes/menu from a photo"
//      open their own screens; then both at once on the combined import:
//      upload the menu PDF, a photographed handwritten recipe card (metric)
//      and a typed recipe PDF (cups and spoons).
//   3. Check what was read against the paper: menu names + prices (the
//      oat-milk add-on isn't an item; the two-size coffee takes the smaller
//      price), recipe names + yields, ingredient lines matched to the price
//      list, metric amounts converted to each ingredient's unit.
//   4. Review like an owner: fix any wrong match, type the cup/spoon amounts
//      in pounds/ounces, make "flaky sea salt" a new ingredient, keep the
//      suggested menu → recipe links. Save.
//   5. The database holds exactly that: 2 recipes with their rows, 7 menu
//      items with prices, links, 1 new ingredient — and Menu shows margins.
//
// Run: node scripts/test-onboarding-e2e.mjs [--base=https://…] [--keep]
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright-core";
import { loadEnv, getAdminClient } from "./lib/supabaseTestEnv.mjs";
import { BUSINESS, INGREDIENTS, MENU_BOARD, RECIPE_CARD, RECIPE_DOC } from "./fixtures/maple-rye/data.mjs";

loadEnv();
execFileSync(process.execPath, ["scripts/make-business-fixtures.mjs"], { stdio: "ignore" });
const BASE = process.argv.find((a) => a.startsWith("--base="))?.slice(7) ?? "http://localhost:3000";
const KEEP = process.argv.includes("--keep");
const OUT = `test-output/onboarding${BASE.includes("localhost") ? "" : "-prod"}`;
const FIX = "scripts/fixtures/maple-rye";
const admin = getAdminClient();
const email = `onboard-${Date.now()}@example.com`;
const password = "Maple-and-Rye-2026!";
const results = [];
const log = (...a) => console.log(...a);
function check(ok, msg, detail) {
  results.push({ ok: !!ok, msg });
  log(`${ok ? "PASS" : "FAIL"}: ${msg}${!ok && detail ? `\n      ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
}
const startCost = Object.fromEntries(INGREDIENTS.map(([n, , u, c]) => [n, { cost: c, unit: u }]));

// Which price-list ingredient a recipe line is, the way the owner reads it.
function intended(raw) {
  const t = raw.toLowerCase();
  if (/flaky/.test(t)) return "new";
  if (/bread flour/.test(t)) return "Bread Flour";
  if (/flour/.test(t)) return "All-Purpose Flour";
  if (/butter/.test(t)) return "Unsalted Butter";
  if (/milk/.test(t)) return "Whole Milk";
  if (/brown sugar/.test(t)) return "Light Brown Sugar";
  if (/sugar/.test(t)) return "Granulated Sugar";
  if (/yeast/.test(t)) return "Instant Yeast";
  if (/salt/.test(t)) return "Kosher Salt";
  if (/egg/.test(t)) return "Large Eggs";
  if (/chocolate|chip/.test(t)) return "Semi-Sweet Chocolate Chips";
  if (/vanilla/.test(t)) return "Pure Vanilla Extract";
  return null;
}
const fillFor = (raw) => {
  const t = raw.toLowerCase();
  for (const [k, v] of Object.entries(RECIPE_DOC.fill)) if (t.includes(k)) return v;
  if (/flour/.test(t)) return RECIPE_DOC.fill.flour;
  return null;
};

const browser = await chromium.launch({ channel: "msedge", headless: true });
let userId, orgId;
try {
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of fs.readdirSync(OUT)) fs.rmSync(`${OUT}/${f}`);
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60_000);

  log("\n=== 1. signup lands on the import, once ===");
  await page.goto(`${BASE}/signup`);
  await page.getByLabel("Business name").fill(BUSINESS.name);
  await page.getByLabel("What kind of business?").selectOption(BUSINESS.type);
  await page.getByLabel("Your name").fill(BUSINESS.owner);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.locator("#acceptTerms").check();
  await page.getByRole("button", { name: /sign up|create/i }).click();
  await page.waitForURL(/\/onboarding\/import\?welcome=1/, { timeout: 60_000 });
  const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
  userId = users.users.find((u) => u.email === email).id;
  orgId = (await admin.from("profiles").select("org_id").eq("id", userId).single()).data.org_id;
  const welcome = await page.getByRole("heading", { level: 1 }).innerText();
  await page.screenshot({ path: `${OUT}/01-welcome.png`, fullPage: true });
  check(/Welcome/.test(welcome) && (await page.getByText("Upload your menu and recipes to get started fast").isVisible()), `new signup → /onboarding/import: "${welcome}"`);
  await page.getByRole("link", { name: "Skip — I'll enter these manually" }).click();
  await page.waitForURL(/\/recipes$/);
  check(true, "Skip → the recipe builder (/recipes)");
  const again = await (await browser.newContext()).newPage();
  await again.goto(`${BASE}/login`);
  await again.getByLabel("Email").fill(email);
  await again.getByLabel("Password", { exact: true }).fill(password);
  await again.getByRole("button", { name: "Log in" }).click();
  await again.waitForURL(/\/(dashboard|onboarding)/);
  check(again.url().endsWith("/dashboard"), `logging in again goes to the dashboard, not the import (${again.url().replace(BASE, "")})`);

  log("\n=== 2. price list, then Import from photo ===");
  await page.goto(`${BASE}/ingredients`);
  await page.getByLabel("Import ingredients CSV").setInputFiles(`${FIX}/ingredients.csv`);
  await page.getByRole("status").filter({ hasText: /Saved/ }).waitFor({ timeout: 120_000 });
  await page.goto(`${BASE}/recipes`);
  await page.getByRole("link", { name: "Import recipes from a photo" }).click();
  await page.waitForURL(/\/onboarding\/import\?kind=recipe$/);
  check((await page.getByTestId("drop-recipe").isVisible()) && !(await page.getByTestId("drop-menu").isVisible()), "Recipes → the recipe import, with no menu drop zone");
  await page.goto(`${BASE}/menu`);
  await page.getByRole("link", { name: "Import menu from a photo" }).click();
  await page.waitForURL(/\/onboarding\/import\?kind=menu$/);
  check((await page.getByTestId("drop-menu").isVisible()) && !(await page.getByTestId("drop-recipe").isVisible()), "Menu → the menu import, with no recipe drop zone");
  // Both at once, as on first run, to exercise the menu → recipe linking.
  await page.goto(`${BASE}/onboarding/import`);
  await page.getByLabel("Choose menu files").setInputFiles(`${FIX}/${MENU_BOARD.file}`);
  await page.getByLabel("Choose recipe files").setInputFiles([`${FIX}/${RECIPE_CARD.file}`, `${FIX}/${RECIPE_DOC.file}`]);
  await page.screenshot({ path: `${OUT}/02-files.png`, fullPage: true });
  const t0 = Date.now();
  await page.getByRole("button", { name: "Read 3 files" }).click();
  await page.getByRole("region", { name: "Menu items to add" }).waitFor({ timeout: 10 * 60_000 });
  log(`  read 3 files in ${Math.round((Date.now() - t0) / 1000)}s`);
  await page.screenshot({ path: `${OUT}/03-review-as-read.png`, fullPage: true });

  log("\n=== 3. what was read ===");
  const menuRows = await page.getByTestId("menu-draft").evaluateAll((rows) =>
    rows.map((r) => ({ name: r.querySelector('input[aria-label="Menu item name"]').value, price: r.querySelectorAll("input")[2].value, recipe: r.querySelector("select").selectedOptions[0]?.textContent })),
  );
  for (const m of menuRows) log(`  menu: ${m.name}  $${m.price}  → ${m.recipe}`);
  check(menuRows.length === MENU_BOARD.expect.length && !menuRows.some((m) => /oat/i.test(m.name)), `${menuRows.length} menu items read (${MENU_BOARD.expect.length} on the menu; the oat-milk add-on left out)`, menuRows);
  for (const [name, price] of MENU_BOARD.expect) {
    const row = menuRows.find((m) => m.name.toLowerCase() === name.toLowerCase());
    check(row && Number(row.price) === price, `menu: ${name} $${price.toFixed(2)}`, row);
  }

  const drafts = page.getByTestId("recipe-draft");
  check((await drafts.count()) === 2, "2 recipes read");
  const decisions = [];
  for (let d = 0; d < (await drafts.count()); d++) {
    const draft = drafts.nth(d);
    const name = await draft.getByRole("textbox").first().inputValue();
    const yieldQty = await draft.getByRole("textbox").nth(1).inputValue();
    const isCard = /croissant/i.test(name);
    const paper = isCard ? RECIPE_CARD : RECIPE_DOC;
    log(`  recipe: ${name} — batch makes ${yieldQty}`);
    check(name.toLowerCase().includes(isCard ? "croissant" : "cookie") && Number(yieldQty) === (isCard ? 24 : 18), `recipe "${name}", makes ${yieldQty} (paper: ${paper.yieldText})`);
    const lines = draft.getByTestId("recipe-line");
    check((await lines.count()) === paper.lines.length, `${paper.title}: ${await lines.count()} of ${paper.lines.length} ingredient lines read`);
    for (let i = 0; i < (await lines.count()); i++) {
      const line = lines.nth(i);
      // The line as printed is the cell's first text node (a status badge and the why-note follow).
      const raw = (await line.locator("td").nth(1).evaluate((td) => td.firstChild?.textContent ?? "")).trim();
      const select = line.getByRole("combobox").first();
      const shown = await select.evaluate((s) => s.selectedOptions[0]?.textContent?.replace(/ \(\d+%\)$/, ""));
      const badge = await line.locator("td").nth(1).locator("span:not([data-testid=line-note])").first().innerText();
      const want = intended(raw);
      let action = "kept";
      if (want === "new") {
        if ((await select.inputValue()) !== "new") await select.selectOption("new");
        await line.getByLabel(/New ingredient name/).fill(RECIPE_DOC.newIngredient.name);
        await line.getByLabel(/Category for/).selectOption(RECIPE_DOC.newIngredient.category);
        await line.getByLabel(/Unit for new ingredient/).fill(RECIPE_DOC.newIngredient.unit);
        action = `new ingredient "${RECIPE_DOC.newIngredient.name}"`;
      } else if (want && shown !== want) {
        await select.selectOption({ label: want });
        action = `corrected ${shown} → ${want}`;
      }
      const qtyBox = line.getByLabel(/^Quantity for/);
      let qty = await qtyBox.inputValue();
      if (isCard && want && want !== "new") {
        const exp = RECIPE_CARD.expect[want];
        check(qty !== "" && Math.abs(Number(qty) - exp) < 0.001, `  ${raw} → ${want} ${qty} ${startCost[want].unit} (converted; paper math ${exp})`, { qty, exp });
      }
      if (qty === "") {
        const v = fillFor(raw);
        if (v != null) {
          await qtyBox.fill(String(v));
          action += `, typed ${v}`;
          qty = String(v);
        }
      }
      decisions.push({ recipe: name, raw, read_as: shown, badge, action, qty });
      log(`    ${raw.padEnd(48)} read as ${String(shown).padEnd(28)} [${badge}] → ${action}${qty ? ` · qty ${qty}` : ""}`);
    }
  }
  const matchedRight = decisions.filter((x) => x.action.startsWith("kept")).length;
  check(matchedRight >= decisions.length - 3, `${matchedRight} of ${decisions.length} ingredient lines matched right first time (${decisions.length - matchedRight} fixed or new)`);
  fs.writeFileSync(`${OUT}/decisions.json`, JSON.stringify(decisions, null, 2));

  // Menu → recipe links the screen suggested.
  await page.getByText("matching to recipes…").waitFor({ state: "hidden", timeout: 180_000 });
  const links = await page.getByTestId("menu-draft").evaluateAll((rows) => rows.map((r) => [r.querySelector('input[aria-label="Menu item name"]').value, r.querySelector("select").selectedOptions[0]?.textContent]));
  const croissantLink = links.find(([n]) => /croissant/i.test(n))?.[1] ?? "";
  const cookieLink = links.find(([n]) => /cookie/i.test(n))?.[1] ?? "";
  check(/croissant/i.test(croissantLink) && /cookie/i.test(cookieLink), `menu items linked to the recipes just read: Croissant → ${croissantLink}, Cookie → ${cookieLink}`);
  await page.screenshot({ path: `${OUT}/04-review-fixed.png`, fullPage: true });

  log("\n=== 4. save ===");
  await page.getByRole("button", { name: /^Save 2 recipes and 7 menu items$/ }).click();
  await page.getByText("You're set up.").waitFor({ timeout: 120_000 });
  const doneText = await page.locator("main").innerText();
  await page.screenshot({ path: `${OUT}/05-done.png`, fullPage: true });
  check(/Added 2 recipes, 7 menu items and 1 new ingredient/.test(doneText), "saved: 2 recipes, 7 menu items, 1 new ingredient");

  log("\n=== 5. what's in the database ===");
  const { data: recipes } = await admin.from("recipes").select("id, name, batch_yield_qty, recipe_ingredients(quantity, unit, ingredients(name))").eq("org_id", orgId);
  for (const r of recipes) log(`  ${r.name} (${r.batch_yield_qty}): ${r.recipe_ingredients.map((ri) => `${ri.ingredients.name} ${ri.quantity} ${ri.unit}`).join(", ")}`);
  const croissant = recipes.find((r) => /croissant/i.test(r.name));
  const cookie = recipes.find((r) => /cookie/i.test(r.name));
  check(croissant && croissant.recipe_ingredients.length === 7 && Object.entries(RECIPE_CARD.expect).every(([n, q]) => croissant.recipe_ingredients.some((ri) => ri.ingredients.name === n && Math.abs(Number(ri.quantity) - q) < 0.001)), "croissant recipe saved with all 7 ingredients in their costing units");
  check(cookie && cookie.recipe_ingredients.length === 9 && cookie.recipe_ingredients.some((ri) => ri.ingredients.name === "Flaky Sea Salt"), "cookie recipe saved with 9 ingredients incl. the new Flaky Sea Salt");
  const { data: newIng } = await admin.from("ingredients").select("name, base_unit, category, current_unit_cost").eq("org_id", orgId).eq("name", "Flaky Sea Salt").maybeSingle();
  check(newIng && newIng.base_unit === "lb" && newIng.category === "dry_goods" && newIng.current_unit_cost == null, `new ingredient: ${JSON.stringify(newIng)}`);
  const { data: menu } = await admin.from("menu_item_margins").select("name, selling_price, margin_pct, cost_per_serving").eq("org_id", orgId).order("name");
  const { data: menuItems } = await admin.from("menu_items").select("name, recipe_id").eq("org_id", orgId);
  for (const m of menu) log(`  menu: ${m.name} $${m.selling_price} cost ${m.cost_per_serving ?? "—"} margin ${m.margin_pct ?? "—"}%`);
  check(menu.length === 7, "7 menu items saved");
  const croissantItem = menuItems.find((m) => /croissant/i.test(m.name));
  check(croissantItem?.recipe_id === croissant?.id, "Butter Croissant is linked to the croissant recipe");
  const cps = Object.entries(RECIPE_CARD.expect).reduce((s, [n, q]) => s + q * startCost[n].cost, 0) / 24;
  const hand = Math.round(((4.25 - cps) / 4.25) * 10000) / 100;
  const cm = menu.find((m) => /croissant/i.test(m.name));
  check(cm && Math.abs(Number(cm.margin_pct) - hand) < 0.02, `Butter Croissant margin ${cm?.margin_pct}% (hand: ${hand}% from the price list)`);
  const ck = menu.find((m) => /cookie/i.test(m.name));
  check(ck && ck.margin_pct == null, "cookie shows no margin yet — Flaky Sea Salt has no price until an invoice or the price list sets one");
  await page.goto(`${BASE}/menu`);
  await page.screenshot({ path: `${OUT}/06-menu.png`, fullPage: true });

  // The Margins tab reads the same numbers, split by ingredient and by item.
  await page.goto(`${BASE}/margins?view=items`);
  const cItem = page.locator(`[data-testid="margin-item"][data-name="${cm?.name}"]`);
  const cText = await cItem.locator("summary").innerText();
  check(cText.includes(`${Number(cm?.margin_pct).toFixed(1)}%`), `Margins → By menu item: ${cm?.name} at ${Number(cm?.margin_pct).toFixed(1)}%, same as the margin view`, cText);
  await page.goto(`${BASE}/margins`);
  const butter = page.locator('[data-testid="margin-ingredient"][data-name="Unsalted Butter"]');
  await butter.locator("summary").click();
  const uses = await butter.locator("tbody tr").allInnerTexts();
  check(uses.some((u) => /croissant/i.test(u)) && uses.some((u) => /cookie/i.test(u)), `Margins → By ingredient: Unsalted Butter opens to the items it goes into (${uses.length})`, uses);
  const flour = await page.locator('[data-testid="margin-ingredient"][data-name="Bread Flour"]').locator("tbody tr").allTextContents();
  check(flour.length > 0 && flour.every((u) => /croissant/i.test(u)), "Bread Flour only shows against the croissant", flour);
  await page.screenshot({ path: `${OUT}/06b-margins.png`, fullPage: true });

  // An item the import left without a recipe can be linked afterwards from Menu.
  await page.goto(`${BASE}/menu`);
  await page.getByRole("button", { name: "Edit Cinnamon Roll" }).click();
  const dlg = page.getByRole("dialog", { name: "Edit Cinnamon Roll" });
  await dlg.getByLabel("Made from recipe").selectOption({ label: "Butter Croissants" });
  await dlg.getByLabel("Servings per batch").fill("12");
  await dlg.getByLabel("Selling price").fill("5.25");
  await page.screenshot({ path: `${OUT}/06c-edit-menu-item.png` });
  await dlg.getByRole("button", { name: "Save" }).click();
  await dlg.waitFor({ state: "hidden" });
  const { data: rollItem } = await admin.from("menu_items").select("id, servings_per_batch").eq("org_id", orgId).eq("name", "Cinnamon Roll").single();
  const { data: rollMargin } = await admin.from("menu_item_margins").select("selling_price, margin_pct, cost_per_serving").eq("menu_item_id", rollItem.id).single();
  const roll = { ...rollMargin, servings_per_batch: rollItem.servings_per_batch };
  const rollHand = Math.round(((5.25 - cps * 2) / 5.25) * 10000) / 100;
  check(Number(roll.selling_price) === 5.25 && Number(roll.servings_per_batch) === 12 && Math.abs(Number(roll.margin_pct) - rollHand) < 0.05, `Edit on Menu: Cinnamon Roll linked, 12 per batch, $5.25 → ${roll.margin_pct}% (hand: ${rollHand}%)`, roll);
  await page.getByRole("row").filter({ hasText: "Cinnamon Roll" }).getByRole("link", { name: "Butter Croissants" }).waitFor();

  const phone = await (await browser.newContext({ storageState: await ctx.storageState(), viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage();
  await phone.goto(`${BASE}/onboarding/import`);
  const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  await phone.screenshot({ path: `${OUT}/07-phone.png`, fullPage: true });
  check(overflow <= 0, `phone: no sideways scroll (${overflow}px)`);
} catch (err) {
  check(false, "run stopped early", err.stack?.split("\n").slice(0, 4).join(" | "));
} finally {
  await browser.close();
  const failed = results.filter((r) => !r.ok);
  log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  for (const f of failed) log(`  FAIL: ${f.msg}`);
  if (KEEP) log(`Kept: ${email} / ${password}`);
  else if (userId) {
    if (orgId) await admin.from("organizations").delete().eq("id", orgId);
    await admin.auth.admin.deleteUser(userId);
    log("test business deleted");
  }
}
