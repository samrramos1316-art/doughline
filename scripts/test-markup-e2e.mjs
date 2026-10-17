// Pricing by markup (lib/costing/markup.ts, migration 030) end to end,
// against a real server and the real database: a jeweler switches Settings
// to a 2.5× markup; the quote, Margins tab, build sheet's cost sheet and the
// saved settings all follow it; 3× prices at exactly 3×; switching back to a
// margin clears the markup. Then the quote's price basis switch: latest
// invoice price vs. the six-month average paid.
//
// Needs a production build (`npx next build`); starts `next start` itself.
//   node scripts/test-markup-e2e.mjs
import { spawn, execSync } from "node:child_process";
import { chromium } from "playwright-core";
import { getAdminClient, assert } from "./lib/supabaseTestEnv.mjs";
import { waitForServer } from "./lib/devServer.mjs";

const PORT = 3223;
const BASE = `http://localhost:${PORT}`;
const admin = getAdminClient();
const suffix = Date.now();
const password = "Test-Password-123!";
const email = `markup-${suffix}@example.com`;
let user;
const text = async (loc) => (await loc.innerText()).replace(/\s+/g, " ");

const server = spawn("npx", ["next", "start", "--port", String(PORT)], { shell: true, stdio: "ignore" });
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  await waitForServer(BASE, 60_000);
  const { data: created, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { business_name: `Markup Test ${suffix}`, business_type: "jewelry" },
  });
  if (error) throw new Error("create user failed: " + error.message);
  const orgId = (await admin.from("profiles").select("org_id").eq("id", created.user.id).single()).data.org_id;
  user = { id: created.user.id, orgId };

  // A ring: 2 g of gold at $60/g, no loss, no labor → $120 to make; sells at $300.
  const { data: gold } = await admin.from("ingredients")
    .insert({ org_id: orgId, name: "14k gold casting grain", base_unit: "g", current_unit_cost: 60, waste_pct: 0 }).select("id").single();
  const { data: sheet } = await admin.from("recipes")
    .insert({ org_id: orgId, name: "Band ring", batch_yield_qty: 1, batch_yield_unit: "ring", labor_minutes: 0, overhead_pct: 0 }).select("id").single();
  await admin.from("recipe_ingredients").insert({ org_id: orgId, recipe_id: sheet.id, ingredient_id: gold.id, quantity: 2, unit: "g" });
  await admin.from("menu_items").insert({ org_id: orgId, recipe_id: sheet.id, name: "Band ring", selling_price: 300 });

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30_000);
  await page.goto(`${BASE}/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: /log in/i }).click();
  await page.waitForURL(/\/dashboard/);

  const saveSettings = async () => {
    await page.getByRole("button", { name: "Save settings" }).click();
    await page.getByRole("status").filter({ hasText: "Saved." }).waitFor();
  };
  const orgRow = async () => (await admin.from("organizations").select("target_margin_pct, target_markup").eq("id", orgId).single()).data;

  // 1. Settings: margin → markup 2.5×.
  await page.goto(`${BASE}/settings`);
  await page.getByLabel("I price by").selectOption("markup");
  await page.getByLabel("Target markup (×)").fill("2.5");
  await saveSettings();
  let o = await orgRow();
  assert(Number(o.target_markup) === 2.5 && Number(o.target_margin_pct) === 60, `saved as 2.5× and its 60% margin: ${JSON.stringify(o)}`);

  // 2. Quote: the target field is a multiplier and the price is cost × 2.5.
  await page.goto(`${BASE}/quote?from=${sheet.id}`);
  const result = page.getByTestId("quote-result");
  await result.waitFor();
  assert((await page.getByLabel("Target markup ×").inputValue()) === "2.5", "quote's target field shows the 2.5× markup");
  let r = await text(result);
  assert(r.includes("$300.00") && r.includes("2.5× is $300.00 (a 60% margin)"), `quote: $120 × 2.5 = $300: ${r}`);
  await page.getByLabel("Your price ($, optional)").fill("250");
  const own = await text(page.getByTestId("quote-own-margin"));
  assert(own.includes("2.08×") && own.includes("52% margin") && own.includes("under your 2.5× target"), `own price read as a markup: ${own}`);
  await page.getByLabel("Target markup ×").fill("3");
  r = await text(result);
  assert(r.includes("$360.00"), `3× is exactly $360.00, not a cent over: ${r}`);

  // 3. Margins tab and dashboard name the markup.
  await page.goto(`${BASE}/margins`);
  await page.locator("main").getByText("target 2.5× markup").first().waitFor();
  const margins = await text(page.locator("main"));
  assert(margins.includes("target 2.5× markup") && /MARGIN · MARKUP 60\.0% · 2\.5×/i.test(margins), `Margins tab: target and the ring's markup: ${margins.slice(0, 900)}`);
  await page.goto(`${BASE}/dashboard`);
  await page.locator("main h2").first().waitFor();
  assert((await text(page.locator("main"))).includes("target 2.5× markup"), "dashboard header names the markup target");

  // 4. Cost sheet: markup column and the price for 2.5×.
  await page.goto(`${BASE}/sheet/${sheet.id}`);
  const sheetText = await text(page.locator("main, article").first());
  assert(/PRICE FOR 2\.5×/i.test(sheetText) && sheetText.includes("$300.00") && /MARKUP/i.test(sheetText), `cost sheet: markup and price for 2.5×: ${sheetText.match(/Sold as.{0,200}/i)?.[0]}`);

  // 5. Back to a margin: the markup is cleared.
  await page.goto(`${BASE}/settings`);
  await page.getByLabel("I price by").selectOption("margin");
  await page.getByLabel("Target margin (%)").fill("65");
  await saveSettings();
  o = await orgRow();
  assert(o.target_markup == null && Number(o.target_margin_pct) === 65, `back to a 65% margin, markup cleared: ${JSON.stringify(o)}`);
  await page.goto(`${BASE}/quote?from=${sheet.id}`);
  r = await text(page.getByTestId("quote-result"));
  assert(r.includes("$342.86") && r.includes("you keep 65%"), `quote back at a 65% margin ($120 ÷ 0.35): ${r}`);

  // 6. Price basis (lib/costing/priceBasis.ts): gold bought at $50, $55 and
  // $60/g over six months (and $40 a year ago, outside the window). Latest
  // is $60 → 2 g = $120; the six-month average $55 → $110.
  assert((await page.getByTestId("price-basis").count()) === 0, "no basis switch while the material has no price history");
  const daysAgo = (d) => new Date(Date.now() - d * 86_400_000).toISOString().slice(0, 10);
  await admin.from("ingredient_price_history").insert([[40, 365], [50, 120], [55, 60], [60, 5]].map(([unit_cost, d]) => (
    { org_id: orgId, ingredient_id: gold.id, unit_cost, unit: "g", effective_date: daysAgo(d), source: "manual" })));
  await page.goto(`${BASE}/quote?from=${sheet.id}`);
  const basis = page.getByTestId("price-basis");
  const basisText = await text(basis);
  assert(basisText.includes("Latest invoice price (what restocking costs): $120.00") && basisText.includes("Average paid, last 6 months (what your stock cost): $110.00"), `basis switch shows both: ${basisText}`);
  await basis.getByLabel(/Average paid/).check();
  r = await text(page.getByTestId("quote-result"));
  assert(r.includes("$314.29") && r.includes("Costs $110.00"), `quote at the average paid ($110 ÷ 0.35): ${r}`);
  await basis.getByLabel(/Latest invoice price/).check();
  r = await text(page.getByTestId("quote-result"));
  assert(r.includes("$342.86"), `and back at the latest price: ${r}`);

  console.log("\nAll markup checks passed.");
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
