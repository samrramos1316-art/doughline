// Guards found in outside testing, end to end on a real deploy (real Claude + Voyage):
//
//   1. The invoice importer turns away a menu and a recipe — "Not an
//      invoice" with a link to the menu & recipe import, no invoice row left
//      behind, no "vendor" named after the business — and still reads a real
//      invoice in the same batch.
//   2. An invoice line priced per case, for an ingredient costed per case,
//      applies the price as printed ($118/case), not "Can't convert 36 lb to
//      case". Per bag of 50 lb → an ingredient costed per lb is $0.49/lb.
//   3. "Add & match" can't create a duplicate: two simultaneous requests for
//      one line give one ingredient; a double-click in the swipe queue too.
//      The form is prefilled with the product name and the unit recipes use.
//
// Run: node scripts/test-import-guards-e2e.mjs [--base=https://…] [--keep]
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright-core";
import { loadEnv, getAdminClient } from "./lib/supabaseTestEnv.mjs";
import { BUSINESS, MENU_BOARD, RECIPE_DOC } from "./fixtures/maple-rye/data.mjs";

loadEnv();
execFileSync(process.execPath, ["scripts/make-business-fixtures.mjs"], { stdio: "ignore" });
const BASE = process.argv.find((a) => a.startsWith("--base="))?.slice(7) ?? "https://doughtally.app";
const KEEP = process.argv.includes("--keep");
const OUT = `test-output/import-guards${BASE.includes("localhost") ? "" : "-prod"}`;
const FIX = "scripts/fixtures/maple-rye";
const INVOICE_FILE = "03-lone-star-this-week.pdf";
const admin = getAdminClient();
const email = `guards-${Date.now()}@example.com`;
const password = "Maple-and-Rye-2026!";
const results = [];
const log = (...a) => console.log(...a);
function check(ok, msg, detail) {
  results.push({ ok: !!ok, msg });
  log(`${ok ? "PASS" : "FAIL"}: ${msg}${!ok && detail ? `\n      ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
}

const browser = await chromium.launch({ channel: "msedge", headless: true });
let userId, orgId;
try {
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of fs.readdirSync(OUT)) fs.rmSync(`${OUT}/${f}`);
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60_000);
  // Same-origin fetch from the signed-in page, so the session cookie rides along.
  const api = (method, path, body) =>
    page.evaluate(
      async ({ method, path, body }) => {
        const res = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
        return { status: res.status, body: await res.json().catch(() => ({})) };
      },
      { method, path, body },
    );

  log("\n=== signup ===");
  await page.goto(`${BASE}/signup`);
  await page.getByLabel("Business name").fill(BUSINESS.name);
  await page.getByLabel("What kind of business?").selectOption(BUSINESS.type);
  await page.getByLabel("Your name").fill(BUSINESS.owner);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.locator("#acceptTerms").check();
  await page.getByRole("button", { name: /sign up|create/i }).click();
  await page.waitForURL(/\/onboarding\/import/, { timeout: 60_000 });
  const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
  userId = users.users.find((u) => u.email === email).id;
  orgId = (await admin.from("profiles").select("org_id").eq("id", userId).single()).data.org_id;
  const meta = users.users.find((u) => u.email === email).user_metadata;
  check(meta.terms_version && !Number.isNaN(Date.parse(meta.terms_accepted_at)), `signed up ${email}, agreeing to terms version ${meta.terms_version} at ${meta.terms_accepted_at}`);

  log("\n=== 1. menu + recipe + invoice through the invoice importer ===");
  await page.goto(`${BASE}/invoices/import`);
  await page.getByLabel("Choose invoice files").setInputFiles([`${FIX}/${MENU_BOARD.file}`, `${FIX}/${RECIPE_DOC.file}`, `${FIX}/${INVOICE_FILE}`]);
  await page.getByRole("button", { name: /Import 3 files/ }).click();
  await page.getByRole("status").filter({ hasText: /processed/ }).waitFor({ timeout: 400_000 });
  await page.screenshot({ path: `${OUT}/01-import.png`, fullPage: true });
  const row = (name) => page.getByTestId("import-item").filter({ hasText: name });
  for (const [file, kind] of [[MENU_BOARD.file, "menu"], [RECIPE_DOC.file, "recipe"]]) {
    const r = row(file);
    const status = await r.getAttribute("data-status");
    const text = await r.innerText();
    const link = await r.getByRole("link", { name: "Import it there" }).getAttribute("href").catch(() => null);
    check(status === "not_invoice" && new RegExp(`looks like a ${kind}`).test(text) && link === `/onboarding/import?kind=${kind}`, `${kind} PDF → "Not an invoice", links to the ${kind} import`, { status, text, link });
  }
  const invStatus = await row(INVOICE_FILE).getAttribute("data-status");
  check(["needs_review", "completed"].includes(invStatus), `the real invoice in the same batch is still read (${invStatus})`);
  const { data: invoices } = await admin.from("invoices").select("id, status, vendors(name)").eq("org_id", orgId);
  check(invoices.length === 1, `one invoice row kept, none for the menu/recipe (${invoices.length})`);
  const { data: vendors } = await admin.from("vendors").select("name").eq("org_id", orgId);
  check(!vendors.some((v) => v.name.toLowerCase().includes(BUSINESS.name.toLowerCase().split(" ")[0])), `no vendor named after the business (${vendors.map((v) => v.name).join(", ")})`);

  log("\n=== 2. case and bag prices ===");
  const invoiceId = crypto.randomUUID();
  const created = await api("POST", "/api/invoices", { id: invoiceId, file_storage_path: `${orgId}/${invoiceId}.jpg`, file_type: "image" });
  check(created.status < 300, `a hand-entered invoice to test with (HTTP ${created.status})`, created.body);
  const lines = await api("POST", `/api/invoices/${invoiceId}/line-items`, {
    lines: [
      { raw_text: "UNSALTED BUTTER AA 36/1# CS", quantity: 2, unit: "case", unit_cost: 118, pack_quantity: 36, pack_unit: "lb" },
      { raw_text: "BREAD FLOUR HI-GLUTEN 50# BAG", quantity: 1, unit: "bag", unit_cost: 24.5, pack_quantity: 50, pack_unit: "lb" },
      { raw_text: "CLOVER HONEY 5# TUB", quantity: 1, unit: "tub", unit_cost: 19, pack_quantity: 5, pack_unit: "lb" },
    ],
  });
  check(lines.status === 201, `3 lines entered (HTTP ${lines.status})`, lines.body);
  const [butterLine, flourLine] = lines.body.line_items ?? [];

  // Two requests at once, as a double-click or a retry after a slow response would send.
  const [a, b] = await Promise.all([
    api("POST", `/api/line-items/${butterLine.id}/create-ingredient`, { name: "Unsalted Butter", base_unit: "case" }),
    api("POST", `/api/line-items/${butterLine.id}/create-ingredient`, { name: "Unsalted Butter", base_unit: "case" }),
  ]);
  check(a.status < 300 && b.status < 300, `both simultaneous "Add & match" requests succeed (${a.status}, ${b.status})`, { a: a.body, b: b.body });
  check(a.body.ingredient?.id && a.body.ingredient.id === b.body.ingredient?.id, "…and return the same ingredient");
  const { data: butters } = await admin.from("ingredients").select("id, base_unit, current_unit_cost").eq("org_id", orgId).ilike("name", "unsalted butter");
  check(butters.length === 1, `one "Unsalted Butter" in the price list (${butters.length})`);
  check(Number(butters[0]?.current_unit_cost) === 118, `$118 per case, costed per case → $118/case (${butters[0]?.current_unit_cost})`);
  const { data: bl } = await admin.from("invoice_line_items").select("price_note, price_applied_at").eq("id", butterLine.id).single();
  check(bl.price_applied_at && !bl.price_note, "price applied, no \"Can't convert\" note", bl);

  const again = await api("POST", `/api/line-items/${butterLine.id}/create-ingredient`, { name: "Butter (retry)", base_unit: "lb" });
  const { count: afterRetry } = await admin.from("ingredients").select("id", { count: "exact", head: true }).eq("org_id", orgId);
  check(again.status === 200 && again.body.alreadyMatched && afterRetry === 1, `a retry on an already-matched line creates nothing (HTTP ${again.status}, ${afterRetry} ingredient)`);

  const flour = await api("POST", `/api/line-items/${flourLine.id}/create-ingredient`, { name: "Bread Flour", base_unit: "lb" });
  check(flour.status === 201 && flour.body.price?.applied && Number(flour.body.price.new_unit_cost) === 0.49, `$24.50 per 50 lb bag, costed per lb → $0.49/lb (${flour.body.price?.new_unit_cost})`, flour.body.price);

  log("\n=== 3. the swipe queue: prefill + double-click ===");
  await page.goto(`${BASE}/invoices/${invoiceId}/review`);
  await page.getByText("CLOVER HONEY 5# TUB").first().waitFor();
  // Past any suggestion to "Create new".
  for (let i = 0; i < 6 && !(await page.getByRole("button", { name: "Create new", exact: true }).isVisible()); i++) {
    await page.getByRole("button", { name: "Not this", exact: true }).click();
    await page.waitForTimeout(800);
  }
  await page.getByRole("button", { name: "Create new", exact: true }).click();
  const name = await page.getByLabel("Ingredient name").inputValue();
  const unit = await page.getByLabel("Base unit (what you cost it in)").inputValue();
  await page.screenshot({ path: `${OUT}/02-create-form.png`, fullPage: true });
  check(/honey/i.test(name) && !/\d|tub/i.test(name), `name prefilled without the pack size ("${name}")`);
  check(unit === "lb", `base unit prefilled with the pack's unit, not the tub ("${unit}")`);
  await page.getByRole("button", { name: "Add & match" }).dblclick();
  await page.getByText("All caught up").waitFor({ timeout: 120_000 });
  const { data: honeys } = await admin.from("ingredients").select("id, current_unit_cost").eq("org_id", orgId).ilike("name", "%honey%");
  check(honeys.length === 1, `double-clicking "Add & match" makes one ingredient (${honeys.length})`);
  check(Number(honeys[0]?.current_unit_cost) === 3.8, `$19 per 5 lb tub → $3.80/lb (${honeys[0]?.current_unit_cost})`);
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
  process.exit(failed.length ? 1 : 0);
}
