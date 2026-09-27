// Build step 10 end to end — real Supabase + real Claude + real Voyage,
// driving the real UI in headless Edge, printing the stored rows at each stage:
//
//   1. Seed a bakery's 15 ingredients with last month's costs (+ history).
//   2. Bulk import (§9.1) through /invoices/import: a real text PDF from a
//      second supplier dated July 14, and a real invoice photo too blurry to
//      read. The PDF is read as a document; the photo lands as 'failed'.
//   3. Historical prices: the July PDF's prices go to ingredient_price_history
//      only — current costs unchanged, no alert, even for a −9.6% egg price.
//   4. Manual-entry grid (§9.2) on the failed invoice: header typed, first row
//      typed with Tab navigation, the rest pasted from the clipboard as a
//      spreadsheet block; a typo'd line total is caught inline and blocks the
//      save; fixed, saved, matched like a scan; then a typed line's price
//      flows into the price-alert cascade.
//   5. Ingredient grid: edit a cost in place, paste new rows, inline
//      validation; then CSV export → edit → import, and a bad CSV rejected
//      whole.
//   6. Recipe grid: paste "name<TAB>qty" rows; units follow the ingredient.
//
// Screenshots: test-output/bulk-import/. KEEP_FIXTURES=1 leaves the data.
// Run: node scripts/test-bulk-import-e2e.mjs
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright-core";
import { loadEnv, getAdminClient, getAnonClient, assert } from "./lib/supabaseTestEnv.mjs";
import { startDevServer, waitForServer, killDevServer } from "./lib/devServer.mjs";

loadEnv();
for (const key of ["CLAUDE_API_KEY", "VOYAGE_API_KEY"]) if (!process.env[key]) throw new Error(`Set ${key} in .env.local`);

const PORT = 3106;
const BASE_URL = `http://localhost:${PORT}`;
const PROJECT_REF = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname.split(".")[0];
const AUTH_COOKIE_NAME = `sb-${PROJECT_REF}-auth-token`;
const OUT_DIR = "test-output/bulk-import";
const PDF = "scripts/fixtures/invoice-hill-country-dairy.pdf";
const BLURRY = "scripts/fixtures/invoice-sysco-bakery-blurry.jpg";
const LAST_MONTH = "2026-08-15";

const INGREDIENTS = [
  ["All-Purpose Flour", "dry_goods", "lb", 0.42], ["Bread Flour", "dry_goods", "lb", 0.55],
  ["Powdered Sugar", "dry_goods", "lb", 0.95], ["Light Brown Sugar", "dry_goods", "lb", 0.88],
  ["Unsalted Butter", "dairy", "lb", 3.4], ["Salted Butter", "dairy", "lb", 3.79],
  ["Large Eggs", "dairy", "each", 0.26], ["Semi-Sweet Chocolate Chips", "dry_goods", "lb", 3.4],
  ["Dark Chocolate Bar 70%", "dry_goods", "lb", 7.2], ["Whole Milk", "dairy", "gal", 4.6],
  ["Buttermilk", "dairy", "qt", 2.1], ["Baking Soda", "dry_goods", "lb", 1.2],
  ["Baking Powder", "dry_goods", "lb", 2.9], ["Kosher Salt", "dry_goods", "lb", 0.9],
  ["Ground Cinnamon", "dry_goods", "oz", 0.6],
].map(([name, category, base_unit, current_unit_cost]) => ({ name, category, base_unit, current_unit_cost }));

// The blurred Sysco invoice, as the owner would copy it off the paper.
const SYSCO_ROWS = [
  ["AP FLOUR BLCHD 50# BG", "3", "BG", "21.48", "50", "lb", "64.44"],
  ["SUGAR GRAN XFINE 50#", "2", "BG", "38.90", "50", "lb", "77.80"],
  ["BUTTER SWT UNSLTD 36/1#", "1", "CS", "142.56", "36", "lb", "142.56"],
  ["EGG LG GR AA LSE 15DZ", "2", "CS", "48.75", "15", "dozen", "79.50"], // typo: should be 97.50
  ["CHOC CHIP SEMI SWT 1M 25#", "1", "CS", "89.20", "25", "lb", "89.20"],
  ["VANILLA XTRCT PURE 32OZ", "1", "EA", "54.10", "32", "oz", "54.10"],
  ["MILK WHL GAL 4/1", "1", "CS", "19.36", "4", "gal", "19.36"],
  ["CRM HVY 40% 12/QT", "1", "CS", "61.44", "12", "qt", "61.44"],
];

const admin = getAdminClient();
const suffix = Date.now();
const email = `bulk-import-e2e-${suffix}@example.com`;
const password = "Test-Password-123!";
let userId, orgId, devServer, session, browser, page, context;
let shot = 0;

const authCookieValue = () => "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
const banner = (t) => console.log(`\n${"=".repeat(80)}\n${t}\n${"=".repeat(80)}`);
async function screenshot(label) {
  shot += 1;
  const file = `${OUT_DIR}/${String(shot).padStart(2, "0")}-${label}.png`;
  await page.screenshot({ path: file, fullPage: true });
  console.log(`   [screenshot] ${file}`);
}
async function api(method, path, body) {
  const res = await context.request.fetch(`${BASE_URL}${path}`, { method, data: body, timeout: 300_000 });
  let json;
  try { json = await res.json(); } catch { json = {}; }
  return { status: res.status(), body: json };
}
async function ingredientsByName() {
  const { data } = await admin.from("ingredients").select("id, name, category, base_unit, current_unit_cost, embedding").eq("org_id", orgId);
  return Object.fromEntries(data.map((i) => [i.name, i]));
}
async function priceHistory(ingredientId) {
  const { data } = await admin.from("ingredient_price_history").select("unit_cost, unit, effective_date, source, invoice_id").eq("ingredient_id", ingredientId).order("created_at");
  return data;
}
async function printLines(invoiceId, label) {
  const { data } = await admin
    .from("invoice_line_items")
    .select("id, raw_text, parsed_item_name, parsed_quantity, parsed_unit, parsed_unit_cost, parsed_line_total, parsed_pack_quantity, parsed_pack_unit, match_status, match_confidence, entry_method, base_unit_cost, price_note, ingredients(name, base_unit)")
    .eq("invoice_id", invoiceId)
    .order("created_at")
    .order("position");
  console.log(`-- invoice_line_items (${label}) --`);
  for (const l of data) {
    console.log(
      `${l.raw_text.padEnd(28)} ${String(l.parsed_quantity).padStart(2)} ${String(l.parsed_unit).padEnd(3)} @ ${String(l.parsed_unit_cost).padEnd(6)} total ${String(l.parsed_line_total).padEnd(6)} pack ${l.parsed_pack_quantity ?? "—"} ${l.parsed_pack_unit ?? ""}`.padEnd(88) +
        ` [${l.entry_method}] read as ${JSON.stringify(l.parsed_item_name)} → ${l.match_status}${l.match_confidence != null ? ` ${l.match_confidence}` : ""}${l.ingredients ? ` ${l.ingredients.name}` : ""}` +
        (l.base_unit_cost != null ? ` · applied $${l.base_unit_cost}/${l.ingredients.base_unit}` : "") +
        (l.price_note ? ` · note: ${l.price_note}` : ""),
    );
  }
  return data;
}
const cell = (label, row) => page.getByLabel(`${label}, row ${row}`, { exact: true });

try {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const f of fs.readdirSync(OUT_DIR)) fs.rmSync(`${OUT_DIR}/${f}`);

  const { data: created, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { business_name: "Sweet Crumb Bakery (bulk import e2e)" },
  });
  if (error) throw new Error("create user failed: " + error.message);
  userId = created.user.id;
  orgId = (await admin.from("profiles").select("org_id").eq("id", userId).single()).data.org_id;
  session = (await getAnonClient().auth.signInWithPassword({ email, password })).data.session;
  console.log(`Test org ${orgId}, user ${email}`);

  devServer = startDevServer(PORT);
  await waitForServer(BASE_URL, 120_000);
  browser = await chromium.launch({ channel: "msedge", headless: true });
  context = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] });
  await context.addCookies([{ name: AUTH_COOKIE_NAME, value: authCookieValue(), domain: "localhost", path: "/", sameSite: "Lax" }]);
  page = await context.newPage();

  // ------------------------------------------------------------------ 1
  banner("STAGE 1 — seed 15 ingredients at last month's costs");
  const { data: ingRows, error: insErr } = await admin.from("ingredients").insert(INGREDIENTS.map((i) => ({ ...i, org_id: orgId }))).select("id, current_unit_cost, base_unit");
  if (insErr) throw new Error(insErr.message);
  await admin.from("ingredient_price_history").insert(ingRows.map((i) => ({ org_id: orgId, ingredient_id: i.id, unit_cost: i.current_unit_cost, unit: i.base_unit, effective_date: LAST_MONTH, source: "manual" })));
  console.log(execFileSync("node", ["scripts/backfill-ingredient-embeddings.mjs", `--org=${orgId}`], { encoding: "utf8" }).trim());

  // ------------------------------------------------------------------ 2
  banner("STAGE 2 — bulk import through /invoices/import: a real PDF + a blurry photo");
  await page.goto(`${BASE_URL}/invoices/import`);
  await page.getByRole("heading", { name: "Import past invoices" }).waitFor();
  await page.getByLabel("Choose invoice files").setInputFiles([PDF, BLURRY]);
  await page.getByRole("button", { name: "Import 2 files" }).waitFor();
  await screenshot("files-chosen");
  const t0 = Date.now();
  await page.getByRole("button", { name: "Import 2 files" }).click();
  await page.waitForFunction(
    () => {
      const items = [...document.querySelectorAll('[data-testid="import-item"]')];
      return items.length === 2 && items.every((i) => ["needs_review", "completed", "failed", "error"].includes(i.dataset.status));
    },
    null,
    { timeout: 400_000, polling: 1000 },
  );
  console.log(`queue finished in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  for (const t of await page.getByTestId("import-item").allInnerTexts()) console.log("queue: " + t.replace(/\s+/g, " ").trim());
  await screenshot("import-queue-done");

  const { data: invoices } = await admin
    .from("invoices")
    .select("id, source_type, file_type, file_storage_path, status, invoice_number, invoice_date, error_message, vendors(name), raw_extraction")
    .eq("org_id", orgId)
    .order("created_at");
  console.log("\n-- invoices where org_id = test org --");
  for (const i of invoices) {
    console.log(`${i.id.slice(0, 8)}… source_type=${i.source_type} file_type=${i.file_type} path=…${i.file_storage_path.slice(-12)} status=${i.status} vendor=${i.vendors?.name ?? "—"} #${i.invoice_number ?? "—"} date=${i.invoice_date ?? "—"} error=${JSON.stringify(i.error_message)}`);
  }
  const pdfInv = invoices.find((i) => i.file_type === "pdf");
  const failedInv = invoices.find((i) => i.file_type === "image");
  assert(invoices.length === 2 && invoices.every((i) => i.source_type === "bulk_upload"), "2 invoices created by POST /api/invoices/bulk, source_type 'bulk_upload'");
  assert(pdfInv.file_storage_path.endsWith(".pdf") && pdfInv.status !== "failed", `PDF stored as .pdf and read (status '${pdfInv.status}')`);
  assert(pdfInv.vendors?.name?.includes("Hill Country") && pdfInv.invoice_number === "HCD-40718" && pdfInv.invoice_date === "2026-07-14", "PDF header read: Hill Country Dairy, HCD-40718, 2026-07-14");
  const pdfLines = await printLines(pdfInv.id, "PDF, read by Claude as a document");
  const expectPdf = ["BUTTER UNSALTED AA 36/1 LB", "MILK WHOLE 4/1 GAL", "CREAM HEAVY 40% 12/1 QT", "EGGS LARGE GR A 15 DZ", "CREAM CHEESE BLOCK 30 LB"];
  assert(pdfLines.length === 5 && expectPdf.every((t) => pdfLines.some((l) => l.raw_text === t)), "all 5 PDF lines extracted verbatim");
  assert(failedInv.status === "failed" && /No line items/.test(failedInv.error_message ?? ""), `blurry photo → status 'failed' (${failedInv.error_message})`);
  console.log(`blurry photo raw_extraction: ${JSON.stringify(failedInv.raw_extraction)}`);

  // ------------------------------------------------------------------ 3
  banner("STAGE 3 — July prices from the PDF are history, not today's cost");
  let ings = await ingredientsByName();
  const PDF_TRUTH = { "BUTTER UNSALTED AA 36/1 LB": "Unsalted Butter", "MILK WHOLE 4/1 GAL": "Whole Milk", "EGGS LARGE GR A 15 DZ": "Large Eggs" };
  for (const [raw, name] of Object.entries(PDF_TRUTH)) {
    const l = pdfLines.find((x) => x.raw_text === raw);
    const costBefore = Number(ings[name].current_unit_cost);
    let outcome;
    if (l.match_status === "auto_matched") {
      outcome = `auto-matched at scan, applied $${l.base_unit_cost}`;
    } else {
      const res = await api("POST", `/api/line-items/${l.id}/confirm`, { ingredient_id: ings[name].id });
      outcome = `confirmed via API: ${JSON.stringify(res.body.price)}`;
      assert(res.status === 200 && res.body.price.applied && res.body.price.historical === true, `${name}: price applied as historical`);
    }
    const hist = await priceHistory(ings[name].id);
    const { data: now } = await admin.from("ingredients").select("current_unit_cost").eq("id", ings[name].id).single();
    console.log(`${name.padEnd(16)} ${outcome}\n   history: ${hist.map((h) => `${h.effective_date} $${h.unit_cost} (${h.source})`).join(" | ")}\n   current_unit_cost: $${costBefore} before → $${now.current_unit_cost} after`);
    assert(hist.some((h) => h.effective_date === "2026-07-14" && h.invoice_id === pdfInv.id) && Number(now.current_unit_cost) === costBefore,
      `${name}: July price recorded in history; current cost still $${costBefore}`);
  }
  const { count: pdfAlerts } = await admin.from("price_alerts").select("id", { count: "exact", head: true }).eq("invoice_id", pdfInv.id);
  assert(pdfAlerts === 0, "no price alert from the July invoice (eggs at $0.235 would be −9.6% vs today's $0.26)");

  // ------------------------------------------------------------------ 4
  banner("STAGE 4 — manual-entry grid on the failed invoice");
  await page.goto(`${BASE_URL}/invoices/${failedInv.id}`);
  await page.getByRole("link", { name: "Enter its line items by hand" }).click();
  await page.getByRole("heading", { name: "Enter invoice lines" }).waitFor();
  await screenshot("manual-entry-empty");
  await page.getByLabel("Vendor").fill("Sysco Central Texas");
  await page.getByLabel("Invoice #").fill("7719-204583");
  await page.getByLabel("Invoice date").fill("2026-09-22");

  // Row 1 typed, moving with Tab like a spreadsheet.
  await cell("Item (as printed)", 1).click();
  for (const [i, v] of SYSCO_ROWS[0].entries()) {
    await page.keyboard.type(v);
    if (i < SYSCO_ROWS[0].length - 1) await page.keyboard.press("Tab");
  }
  // Rows 2-8 pasted as a tab-separated block (what copying cells from a spreadsheet puts on the clipboard).
  const tsv = SYSCO_ROWS.slice(1).map((r) => r.join("\t")).join("\n");
  await page.evaluate((t) => navigator.clipboard.writeText(t), tsv);
  await cell("Item (as printed)", 2).click();
  await page.keyboard.press("Control+V");
  const gridValues = await page.evaluate(() =>
    [...document.querySelectorAll('table[aria-label="Invoice line items"] tbody tr')].map((tr) => [...tr.querySelectorAll("input")].map((i) => i.value)),
  );
  console.log("grid after typing row 1 + pasting 7 rows:");
  for (const r of gridValues) console.log("   " + r.join(" | "));
  assert(gridValues.length === 9 && gridValues[8].every((v) => v === ""), "8 filled rows + 1 waiting blank row");
  assert(SYSCO_ROWS.every((r, i) => r.every((v, j) => gridValues[i][j] === v)), "every typed/pasted cell landed in the right column");

  const inlineError = page.getByRole("alert").filter({ hasText: "not $79.50" });
  await inlineError.waitFor();
  console.log(`inline validation on row 4: "${await inlineError.innerText()}"`);
  await screenshot("manual-entry-inline-error");
  await page.getByRole("button", { name: "Save lines" }).click();
  const blockedMsg = await page.getByRole("status").innerText();
  console.log(`Save with the error: "${blockedMsg}"`);
  const { count: linesWhileBlocked } = await admin.from("invoice_line_items").select("id", { count: "exact", head: true }).eq("invoice_id", failedInv.id);
  assert(/nothing was saved/.test(blockedMsg) && linesWhileBlocked === 0, "save refused while a row is invalid — 0 lines written");

  await cell("Line total", 4).fill("97.50");
  assert((await inlineError.count()) === 0, "error clears once the total is fixed");
  const t1 = Date.now();
  await page.getByRole("button", { name: "Save lines" }).click();
  await page.getByRole("status").filter({ hasText: "Saved." }).waitFor({ timeout: 300_000 });
  console.log(`Save → "${await page.getByRole("status").innerText()}" (${((Date.now() - t1) / 1000).toFixed(1)}s)`);
  await page.waitForTimeout(1500);
  await screenshot("manual-entry-saved");

  const { data: invAfter } = await admin.from("invoices").select("status, invoice_number, invoice_date, vendors(name)").eq("id", failedInv.id).single();
  console.log(`invoices row now: status '${invAfter.status}', vendor '${invAfter.vendors?.name}', #${invAfter.invoice_number}, ${invAfter.invoice_date}`);
  const manualLines = await printLines(failedInv.id, "typed into the grid");
  assert(invAfter.status !== "failed" && invAfter.vendors?.name === "Sysco Central Texas", `invoice moved from 'failed' to '${invAfter.status}' with the typed header`);
  assert(manualLines.length === 8 && manualLines.every((l) => l.entry_method === "manual"), "8 lines stored, entry_method 'manual'");
  assert(manualLines.find((l) => l.raw_text.startsWith("EGG")).parsed_line_total === 97.5, "the corrected line total was stored");
  assert(manualLines.every((l) => l.parsed_item_name), "every typed line got a plain-English name for matching");
  const MANUAL_TRUTH = {
    "AP FLOUR BLCHD 50# BG": "All-Purpose Flour", "BUTTER SWT UNSLTD 36/1#": "Unsalted Butter", "EGG LG GR AA LSE 15DZ": "Large Eggs",
    "CHOC CHIP SEMI SWT 1M 25#": "Semi-Sweet Chocolate Chips", "MILK WHL GAL 4/1": "Whole Milk",
  };
  for (const [raw, truth] of Object.entries(MANUAL_TRUTH)) {
    const l = manualLines.find((x) => x.raw_text === raw);
    const { data: full } = await admin.from("invoice_line_items").select("candidate_matches").eq("id", l.id).single();
    assert(l.ingredients?.name === truth || full.candidate_matches?.[0]?.name === truth,
      `typed '${raw}' → ${l.match_status}, top match ${full.candidate_matches?.[0]?.name} ${full.candidate_matches?.[0]?.similarity} (truth ${truth})`);
  }

  // A typed line feeds the price cascade exactly like a scanned one.
  ings = await ingredientsByName();
  const butterLine = manualLines.find((l) => l.raw_text.startsWith("BUTTER"));
  const confirm = await api("POST", `/api/line-items/${butterLine.id}/confirm`, { ingredient_id: ings["Unsalted Butter"].id });
  console.log(`confirm typed butter line → ${JSON.stringify(confirm.body.price)}`);
  const { data: alert } = await admin.from("price_alerts").select("previous_unit_cost, new_unit_cost, pct_change, invoice_id").eq("org_id", orgId).maybeSingle();
  console.log(`price_alerts row: ${JSON.stringify(alert)}`);
  assert(confirm.body.price.historical === false && alert?.invoice_id === failedInv.id && Number(alert.pct_change) === 16.47,
    "typed butter price ($142.56 / 36 lb = $3.96) raised the +16.47% alert, same as a scan");

  // ------------------------------------------------------------------ 5
  banner("STAGE 5 — ingredient grid, then CSV export → edit → import");
  await page.goto(`${BASE_URL}/ingredients`);
  await page.getByRole("table", { name: "Ingredients" }).waitFor();
  const names = await page.locator('input[aria-label^="Name, row"]').evaluateAll((els) => els.map((e) => e.value));
  const saltRow = names.indexOf("Kosher Salt") + 1;
  await cell("Cost / unit", saltRow).fill("0.95");
  const blank = names.length; // the trailing blank row
  await page.evaluate((t) => navigator.clipboard.writeText(t), "Cream Cheese\tdairy\tlb\t3.21\nPastry Flour\tdry_goods\tlb\tabc");
  await cell("Name", blank).click();
  await page.keyboard.press("Control+V");
  const costErr = page.getByRole("alert").filter({ hasText: '"abc" isn\'t a number' });
  await costErr.waitFor();
  console.log(`inline validation: "${await costErr.innerText()}"`);
  await screenshot("ingredients-grid-error");
  await cell("Cost / unit", blank + 1).fill("0.61");
  const saveBtn = page.getByRole("button", { name: /^Save 3 changes$/ });
  await saveBtn.click();
  await page.getByRole("status").filter({ hasText: "Saved —" }).waitFor({ timeout: 300_000 });
  console.log(`grid save → "${await page.getByRole("status").innerText()}"`);
  await screenshot("ingredients-grid-saved");
  ings = await ingredientsByName();
  for (const n of ["Kosher Salt", "Cream Cheese", "Pastry Flour"]) {
    const i = ings[n];
    const hist = await priceHistory(i.id);
    console.log(`${n.padEnd(14)} ${i.category} ${i.base_unit} $${i.current_unit_cost} embedding ${i.embedding ? "1024 dims" : "MISSING"} · history: ${hist.map((h) => `${h.effective_date} $${h.unit_cost} (${h.source})`).join(" | ")}`);
  }
  assert(Number(ings["Kosher Salt"].current_unit_cost) === 0.95 && (await priceHistory(ings["Kosher Salt"].id)).length === 2, "Kosher Salt cost 0.90 → 0.95, with a manual price-history row");
  assert(ings["Cream Cheese"]?.embedding && ings["Pastry Flour"]?.embedding && Number(ings["Pastry Flour"].current_unit_cost) === 0.61, "pasted rows inserted with embeddings");

  const exported = await context.request.get(`${BASE_URL}/api/ingredients/export`);
  const csv = await exported.text();
  console.log(`GET /api/ingredients/export → ${exported.status()} ${exported.headers()["content-type"]}, ${exported.headers()["content-disposition"]}`);
  console.log(csv.split("\r\n").slice(0, 4).map((l) => "   " + l).join("\n") + `\n   … ${csv.trim().split("\r\n").length - 1} rows`);
  assert(csv.startsWith("id,name,category,base_unit,current_unit_cost,commodity_code\r\n") && csv.trim().split("\r\n").length === 18, "export has the header + all 17 ingredients");

  const cinnamonBefore = ings["Ground Cinnamon"];
  const edited = csv
    .split("\r\n")
    .map((line) => (line.includes(",Ground Cinnamon,") ? line.replace("Ground Cinnamon", "Ceylon Cinnamon") : line))
    .map((line) => (line.includes(",Baking Soda,") ? line.replace(",1.2,", ",1.35,") : line))
    .join("\r\n") + ",Almond Flour,dry_goods,lb,4.10,\r\n";
  await page.getByLabel("Import ingredients CSV").setInputFiles({ name: "ingredients-edited.csv", mimeType: "text/csv", buffer: Buffer.from(edited) });
  // The grid save's "Saved — …" is still showing; wait for this import's own counts.
  await page.getByRole("status").filter({ hasText: "1 added, 2 updated" }).waitFor({ timeout: 300_000 });
  console.log(`CSV import (renamed Ground Cinnamon, Baking Soda 1.20→1.35, added Almond Flour) → "${await page.getByRole("status").innerText()}"`);
  ings = await ingredientsByName();
  assert(ings["Ceylon Cinnamon"]?.id === cinnamonBefore.id && !ings["Ground Cinnamon"] && ings["Ceylon Cinnamon"].embedding !== cinnamonBefore.embedding,
    "rename kept the same id and re-embedded the new name");
  assert(Number(ings["Baking Soda"].current_unit_cost) === 1.35 && ings["Almond Flour"]?.embedding, "cost change applied; new row inserted with an embedding");

  const badCsv = "name,category,base_unit,current_unit_cost\r\nRye Flour,dry_goods,,0.70\r\nSea Salt,dry_goods,lb,-2\r\n";
  await page.getByLabel("Import ingredients CSV").setInputFiles({ name: "bad.csv", mimeType: "text/csv", buffer: Buffer.from(badCsv) });
  const bad = page.getByRole("status").filter({ hasText: "Nothing was saved" });
  await bad.waitFor({ timeout: 60_000 });
  console.log(`bad CSV → "${(await bad.innerText()).split("\n").filter(Boolean).join(" / ")}"`);
  await screenshot("ingredients-bad-csv");
  const { count: ingCount } = await admin.from("ingredients").select("id", { count: "exact", head: true }).eq("org_id", orgId);
  assert(/Row 2: Base unit is required/.test(await bad.innerText()) && /Row 3: "-2" isn't a cost/.test(await bad.innerText()),
    "errors name the spreadsheet rows (header is row 1)");
  assert(ingCount === 18 && !(await ingredientsByName())["Rye Flour"], "bad CSV rejected whole — still 18 ingredients, nothing half-applied");

  // ------------------------------------------------------------------ 6
  banner("STAGE 6 — recipe grid: paste name<TAB>qty rows");
  const recipe = await api("POST", "/api/recipes", { name: "Butter Croissants", batch_yield_qty: 12, batch_yield_unit: "croissants" });
  await page.goto(`${BASE_URL}/recipes/${recipe.body.recipe.id}`);
  await page.getByRole("table", { name: "Recipe ingredients" }).waitFor();
  await page.evaluate((t) => navigator.clipboard.writeText(t), "All-Purpose Flour\t2\nunsalted butter\t1.25\nWhole Milk\t0.15\nLarge Eggs\t1\nKosher Salt\t0.03");
  await cell("Ingredient", 1).focus();
  await page.keyboard.press("Control+V");
  const recipeGrid = await page.evaluate(() =>
    [...document.querySelectorAll('table[aria-label="Recipe ingredients"] tbody tr')].map((tr) => {
      const sel = tr.querySelector("select");
      return [sel.options[sel.selectedIndex]?.text ?? "", ...[...tr.querySelectorAll("input")].map((i) => i.value)];
    }),
  );
  for (const r of recipeGrid) console.log("   " + r.join(" | "));
  assert(recipeGrid.slice(0, 5).map((r) => r[2]).join(",") === "lb,lb,gal,each,lb", "names resolved (case-insensitive) and each unit follows its ingredient");
  await page.getByRole("button", { name: "Save recipe" }).click();
  await page.waitForResponse((r) => r.url().includes(`/api/recipes/${recipe.body.recipe.id}`) && r.request().method() === "PATCH");
  await page.waitForTimeout(1500);
  await screenshot("recipe-grid-saved");
  const { data: ri } = await admin.from("recipe_ingredients").select("quantity, unit, ingredients(name, current_unit_cost)").eq("recipe_id", recipe.body.recipe.id);
  const { data: rc } = await admin.from("recipe_costs").select("batch_total_cost, cost_per_serving").eq("recipe_id", recipe.body.recipe.id).single();
  const hand = ri.reduce((s, r) => s + Number(r.quantity) * Number(r.ingredients.current_unit_cost), 0);
  for (const r of ri) console.log(`   ${r.ingredients.name.padEnd(18)} ${r.quantity} ${r.unit} × $${r.ingredients.current_unit_cost}`);
  console.log(`recipe_costs: batch $${Number(rc.batch_total_cost).toFixed(4)}, per croissant $${Number(rc.cost_per_serving).toFixed(4)} (hand: $${hand.toFixed(4)} / 12 = $${(hand / 12).toFixed(4)})`);
  assert(ri.length === 5 && Math.abs(Number(rc.batch_total_cost) - hand) < 1e-6, "5 recipe_ingredients saved; recipe_costs matches the hand total");

  console.log("\nBulk import / manual entry end-to-end test passed.");
} finally {
  if (browser) await browser.close();
  killDevServer(devServer);
  if (process.env.KEEP_FIXTURES === "1") {
    console.log(`\nKEEP_FIXTURES=1 — left in Supabase: org ${orgId}, user ${email}`);
  } else if (orgId) {
    console.log("\nCleaning up test fixtures...");
    const { data: files } = await admin.storage.from("invoices").list(orgId);
    if (files?.length) await admin.storage.from("invoices").remove(files.map((f) => `${orgId}/${f.name}`));
    await admin.from("organizations").delete().eq("id", orgId);
    if (userId) await admin.auth.admin.deleteUser(userId);
    console.log("Cleanup done.");
  }
}
