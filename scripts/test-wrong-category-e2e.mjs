// Uploads in the wrong box, end to end with real Claude + Voyage. Every
// reader decides what a file really is, whatever box it was dropped in:
//
//   1. Menu import ← a recipe and a supplier invoice. The recipe is read as a
//      recipe (with a note saying so); the invoice is flagged, and "Read it
//      as an invoice" turns the same upload into an invoice with its lines.
//   2. Recipe import ← a menu. Read as a menu, with a note.
//   3. Invoice import ← a menu and a flyer. The menu is turned away with
//      "Import it as a menu", which opens the menu import and reads the same
//      file at once; the flyer is turned away too. Neither leaves a failed
//      invoice behind.
//
// Run: node scripts/test-wrong-category-e2e.mjs [--base=https://…] [--keep]
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright-core";
import { loadEnv, getAdminClient } from "./lib/supabaseTestEnv.mjs";
import { BUSINESS, MENU_BOARD, RECIPE_DOC } from "./fixtures/maple-rye/data.mjs";

loadEnv();
execFileSync(process.execPath, ["scripts/make-business-fixtures.mjs"], { stdio: "ignore" });
const BASE = process.argv.find((a) => a.startsWith("--base="))?.slice(7) ?? "https://doughtally.app";
const KEEP = process.argv.includes("--keep");
const OUT = `test-output/wrong-category${BASE.includes("localhost") ? "" : "-prod"}`;
const FIX = "scripts/fixtures/maple-rye";
const INVOICE_FILE = "03-lone-star-this-week.pdf";
const admin = getAdminClient();
const email = `wrongbox-${Date.now()}@example.com`;
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
  // Something that is none of the three: a bake-sale flyer.
  const flyer = `${OUT}/bake-sale-flyer.pdf`;
  const pdfPage = await browser.newPage();
  await pdfPage.setContent(`<div style="font-family:Georgia;text-align:center;padding:80px">
    <h1 style="font-size:64px">Community Bake Sale!</h1><p style="font-size:28px">Saturday, October 10 · 9am–1pm · St. Mark's Hall</p>
    <p style="font-size:22px">Bring the family. Face painting, live music and a raffle. All proceeds go to the library roof fund.</p></div>`);
  await pdfPage.pdf({ path: flyer, format: "Letter" });
  await pdfPage.close();

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60_000);

  log("\n=== signup ===");
  await page.goto(`${BASE}/signup`);
  await page.getByLabel("Business name").fill(BUSINESS.name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.locator("#acceptTerms").check();
  await page.getByRole("button", { name: /create/i }).click();
  await page.waitForURL(/\/onboarding\/import/, { timeout: 60_000 });
  const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
  userId = users.users.find((u) => u.email === email).id;
  orgId = (await admin.from("profiles").select("org_id").eq("id", userId).single()).data.org_id;
  log(`signed up ${email}`);

  log("\n=== 1. menu import ← a recipe and an invoice ===");
  await page.goto(`${BASE}/onboarding/import?kind=menu`);
  await page.getByLabel("Choose menu files").setInputFiles([`${FIX}/${RECIPE_DOC.file}`, `${FIX}/${INVOICE_FILE}`]);
  await page.getByRole("button", { name: "Read 2 files" }).click();
  const wrong = page.getByTestId("wrong-place");
  await wrong.waitFor({ timeout: 8 * 60_000 });
  await page.getByText("matching to recipes…").waitFor({ state: "hidden", timeout: 180_000 }).catch(() => {});
  await page.screenshot({ path: `${OUT}/01-menu-import.png`, fullPage: true });
  const moved = await page.getByTestId("moved-file").allInnerTexts();
  check(moved.some((t) => t.includes(RECIPE_DOC.file) && /uploaded as a menu, but it's a recipe/.test(t)), "a recipe dropped in the menu box: flagged and read as a recipe", moved);
  const drafts = await page.getByTestId("recipe-draft").count();
  check(drafts === 1, `…and it's in the review as a recipe (${drafts} recipe draft)`);
  const inv = page.getByTestId("invoice-file");
  const invText = await inv.innerText();
  check(invText.includes(INVOICE_FILE) && /supplier invoice/.test(invText), "an invoice dropped in the menu box: flagged as a supplier invoice", invText);
  await inv.getByRole("button", { name: "Read it as an invoice" }).click();
  await inv.getByRole("link", { name: /Open it in Invoices/ }).waitFor({ timeout: 6 * 60_000 });
  const { data: invoices1 } = await admin.from("invoices").select("id, status, file_storage_path, vendors(name), invoice_line_items(id)").eq("org_id", orgId);
  const made = invoices1[0];
  check(
    invoices1.length === 1 && ["needs_review", "completed"].includes(made.status) && made.invoice_line_items.length > 0,
    `"Read it as an invoice" made it an invoice from the same upload, no re-upload (${made?.status}, ${made?.invoice_line_items.length} lines, ${made?.vendors?.name})`,
    invoices1,
  );
  await page.screenshot({ path: `${OUT}/02-sent-to-invoices.png`, fullPage: true });

  log("\n=== 2. recipe import ← a menu ===");
  await page.goto(`${BASE}/onboarding/import?kind=recipe`);
  await page.getByLabel("Choose recipe files").setInputFiles(`${FIX}/${MENU_BOARD.file}`);
  await page.getByRole("button", { name: "Read 1 file" }).click();
  await page.getByTestId("wrong-place").waitFor({ timeout: 6 * 60_000 });
  const moved2 = await page.getByTestId("moved-file").innerText();
  const menuRows = await page.getByTestId("menu-draft").count();
  check(/uploaded as a recipe, but it's a menu/.test(moved2) && menuRows === MENU_BOARD.expect.length, `a menu dropped in the recipe box: flagged and read as a menu (${menuRows} items)`, moved2);
  await page.screenshot({ path: `${OUT}/03-recipe-import.png`, fullPage: true });

  log("\n=== 3. invoice import ← a menu and a flyer ===");
  await page.goto(`${BASE}/invoices/import`);
  await page.getByLabel("Choose invoice files").setInputFiles([`${FIX}/${MENU_BOARD.file}`, flyer]);
  await page.getByRole("button", { name: /Import 2 files/ }).click();
  await page.getByRole("status").filter({ hasText: /processed/ }).waitFor({ timeout: 400_000 });
  await page.screenshot({ path: `${OUT}/04-invoice-import.png`, fullPage: true });
  const row = (name) => page.getByTestId("import-item").filter({ hasText: name });
  const menuRow = row(MENU_BOARD.file);
  const menuLink = menuRow.getByRole("link", { name: "Import it as a menu" });
  const href = await menuLink.getAttribute("href").catch(() => null);
  check((await menuRow.getAttribute("data-status")) === "not_invoice" && /kind=menu&file=/.test(href ?? ""), `the menu: "Not an invoice", with "Import it as a menu" carrying the file (${href})`);
  const flyerRow = row("bake-sale-flyer.pdf");
  const flyerText = await flyerRow.innerText();
  check((await flyerRow.getAttribute("data-status")) === "not_invoice" && (await flyerRow.getByRole("link").count()) === 0, "the flyer: \"Not an invoice\", nothing to import it as", flyerText);
  const { data: invoices2 } = await admin.from("invoices").select("id, status").eq("org_id", orgId);
  check(invoices2.length === 1 && !invoices2.some((i) => i.status === "failed"), `no failed invoices left behind — only the real one (${invoices2.length} invoice, ${invoices2.filter((i) => i.status === "failed").length} failed)`, invoices2);

  await menuLink.click();
  await page.waitForURL(/\/onboarding\/import\?kind=menu&file=/);
  await page.getByTestId("menu-draft").first().waitFor({ timeout: 5 * 60_000 });
  const handed = await page.getByTestId("menu-draft").count();
  check(handed === MENU_BOARD.expect.length, `"Import it as a menu" opened the menu import and read the same file straight away (${handed} items)`);
  await page.screenshot({ path: `${OUT}/05-handed-over.png`, fullPage: true });
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
