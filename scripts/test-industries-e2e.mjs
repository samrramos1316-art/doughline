// Industry profiles end to end (lib/industries): labels, defaults, costing
// with waste and labor, Market Watch gating, the Settings picker and the
// ENABLED_INDUSTRIES gate — against a real server and the real database.
//
// Needs a production build (`npx next build`); starts `next start` itself.
//   node scripts/test-industries-e2e.mjs         # ENABLED_INDUSTRIES unset: every industry offered
//   node scripts/test-industries-e2e.mjs --food  # ENABLED_INDUSTRIES narrowed to the food types
import { spawn, execSync } from "node:child_process";
import { chromium } from "playwright-core";
import { getAdminClient, assert } from "./lib/supabaseTestEnv.mjs";
import { waitForServer } from "./lib/devServer.mjs";

const FOOD_ONLY = process.argv.includes("--food");
const PORT = FOOD_ONLY ? 3221 : 3220;
const BASE = `http://localhost:${PORT}`;
const FOOD = "bakery,food_truck,caterer";
const admin = getAdminClient();
const suffix = Date.now();
const password = "Test-Password-123!";
const users = [];

async function makeUser(type) {
  const email = `industry-${type}-${suffix}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { business_name: `Industry Test ${type} ${suffix}`, business_type: type },
  });
  if (error) throw new Error("create user failed: " + error.message);
  const { data: profile } = await admin.from("profiles").select("org_id").eq("id", data.user.id).single();
  users.push({ id: data.user.id, orgId: profile.org_id });
  return { email, orgId: profile.org_id };
}

const env = { ...process.env, ENABLED_INDUSTRIES: FOOD_ONLY ? FOOD : "" };
const server = spawn("npx", ["next", "start", "--port", String(PORT)], { shell: true, stdio: "ignore", env });
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  await waitForServer(BASE, 60_000);
  const jeweler = await makeUser("jewelry");
  const baker = await makeUser("bakery");
  const florist = await makeUser("florist");

  // A build sheet: 8 g sterling ($1.20/g) with 5% waste, a $6 stone, 45 min
  // at $24/h; sold as a $95 ring → cost 8/0.95×1.20 + 6 + 18 = $34.1053.
  // The 5% is set once on the sterling (migration 027); the lines follow it.
  const { data: ings, error: ingErr } = await admin.from("ingredients").insert([
    { org_id: jeweler.orgId, name: "Sterling casting grain", base_unit: "g", category: "precious_metal", current_unit_cost: 1.2, waste_pct: 5 },
    { org_id: jeweler.orgId, name: "White sapphire 3mm", base_unit: "each", category: "stone", current_unit_cost: 6, waste_pct: 0 },
  ]).select("id, name");
  if (ingErr) throw new Error("insert ingredients failed: " + ingErr.message);
  const { data: recipe, error: recipeErr } = await admin.from("recipes").insert({
    org_id: jeweler.orgId, name: "Stacking ring", batch_yield_qty: 1, batch_yield_unit: "rings", labor_minutes: 45, labor_rate_per_hour: 24,
  }).select("id").single();
  if (recipeErr) throw new Error("insert recipe failed: " + recipeErr.message);
  const { error: riErr } = await admin.from("recipe_ingredients").insert([
    { org_id: jeweler.orgId, recipe_id: recipe.id, ingredient_id: ings[0].id, quantity: 8, unit: "g" },
    { org_id: jeweler.orgId, recipe_id: recipe.id, ingredient_id: ings[1].id, quantity: 1, unit: "each" },
  ]);
  if (riErr) throw new Error("insert recipe lines failed: " + riErr.message);
  await admin.from("menu_items").insert({ org_id: jeweler.orgId, recipe_id: recipe.id, name: "Stacking ring", selling_price: 95 });

  const login = async (email) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await ctx.newPage();
    page.setDefaultTimeout(30_000);
    await page.goto(`${BASE}/login`);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: /log in/i }).click();
    await page.waitForURL(/\/dashboard/);
    await page.locator("main h2").first().waitFor(); // past the loading outline
    return page;
  };
  const navLinks = async (page) => (await page.locator("aside nav a").allInnerTexts()).map((t) => t.trim());

  // ---- the jeweler -------------------------------------------------------
  const j = await login(jeweler.email);
  let nav = await navLinks(j);
  assert(nav.includes("Products") && nav.includes("Build sheets") && nav.includes("Materials"), `jeweler nav uses the profile's words: ${nav.join(", ")}`);
  assert(!nav.includes("Market watch") && !nav.includes("Menu"), "jeweler nav has no Market watch (no metal series ingested) and no food words");
  assert((await j.getByText(/Market watch ·/).count()) === 0, "jeweler dashboard hides the Market Watch panel");
  const headings = await j.locator("main h2").allInnerTexts();
  assert(headings.some((h) => /products margins/i.test(h)) && !headings.some((h) => /menu margins/i.test(h)), `dashboard card wording comes from the profile: ${headings.join(" | ")}`);

  await j.goto(`${BASE}/recipes/${recipe.id}`);
  await j.getByRole("button", { name: /^Save build sheet$/i }).waitFor(); // past the loading outline
  assert((await j.getByRole("columnheader", { name: "Waste %" }).count()) > 0, "build sheet shows the Waste % column");
  assert(await j.locator("details").first().evaluate((d) => d.open), "Labor & overhead starts open (show_labor_by_default)");
  assert((await j.getByText(/A blank Waste % uses the material's own waste %/).count()) === 1, "build sheet explains blank waste = the material's");
  const wastePlaceholders = await j.locator('input[data-cell$=":3"]').evaluateAll((els) => els.map((e) => e.placeholder));
  assert(wastePlaceholders[0] === "5" && wastePlaceholders[1] === "0", `blank waste cells show each material's own %: ${wastePlaceholders.join(", ")}`);
  const perPieceText = async () => (await j.locator("main").innerText()).replace(/\s+/g, " ").match(/÷ \d+ \w+ = \$[\d.]+ each/)?.[0] ?? "(no batch cost panel)";
  let perPiece = await perPieceText();
  assert(perPiece.includes("$34.1053"), `build sheet cost uses the material's 5% waste and labor: ${perPiece}`);
  assert((await j.getByText("+5% waste").count()) === 1, "the cost table shows the sterling's 5% waste");

  // Saving with blank waste keeps the lines following the material.
  await j.getByRole("button", { name: /^Save build sheet$/i }).click();
  await j.waitForLoadState("networkidle");
  const { data: savedLines } = await admin.from("recipe_ingredients").select("waste_pct").eq("recipe_id", recipe.id);
  assert(savedLines.length === 2 && savedLines.every((l) => l.waste_pct === null), `saved with blank waste: lines still follow their material (${savedLines.map((l) => l.waste_pct).join(", ")})`);

  // Change the material's waste once; the build sheet follows (8/0.9×1.20 + 6 + 18 = $34.6667).
  await admin.from("ingredients").update({ waste_pct: 10 }).eq("id", ings[0].id);
  await j.reload();
  await j.getByRole("button", { name: /^Save build sheet$/i }).waitFor(); // past the loading outline
  perPiece = await perPieceText();
  assert(perPiece.includes("$34.6667"), `changing the sterling's waste to 10% re-costs the build sheet: ${perPiece}`);

  // A line's own % overrides the material's: type 0 on the sterling line.
  await j.locator('input[data-cell="0:3"]').fill("0");
  await j.getByRole("button", { name: /^Save build sheet$/i }).click();
  await j.waitForLoadState("networkidle");
  await j.reload();
  await j.getByRole("button", { name: /^Save build sheet$/i }).waitFor(); // past the loading outline
  perPiece = await perPieceText();
  assert(perPiece.includes("$33.6000"), `a line's own 0% overrides the material's 10%: ${perPiece}`);
  await admin.from("ingredients").update({ waste_pct: 5 }).eq("id", ings[0].id);
  await admin.from("recipe_ingredients").update({ waste_pct: null }).eq("recipe_id", recipe.id);

  await j.goto(`${BASE}/margins`);
  assert((await j.getByText("64.1%").count()) > 0, "the ring's margin (64.1%) includes waste and labor");

  // ---- the custom-order quote calculator (jewelry core) -------------------
  assert((await navLinks(j)).includes("Quote"), "jeweler nav has Quote");
  await j.goto(`${BASE}/recipes/${recipe.id}`);
  assert((await j.getByRole("link", { name: "Cost sheet" }).count()) === 1, "jeweler build sheet links its cost sheet");
  await j.getByRole("link", { name: "Quote a custom version" }).click();
  await j.waitForURL(/\/quote\?from=/);
  const result = j.getByTestId("quote-result");
  await result.waitFor();
  // Same piece as the build sheet: $34.1053 to make; at the 65% target → $97.45.
  assert((await result.innerText()).includes("$97.45"), `quote suggests $97.45 at a 65% margin: ${(await result.innerText()).replace(/\s+/g, " ")}`);
  assert((await j.locator("main").innerText()).includes("$34.1053"), "quote costs the piece exactly like its build sheet");
  await j.getByLabel("Your price ($, optional)").fill("95");
  assert((await j.getByTestId("quote-own-margin").innerText()).includes("64.1% margin, under your 65% target"), "your own price shows its margin against the target");
  // A heavier custom version: 12 g of sterling instead of 8 → 12/0.95×1.20 + 6 + 18 = $39.1579; ÷ 0.35 → $111.88.
  await j.getByLabel("Your price ($, optional)").fill("");
  await j.locator('input[data-cell="0:1"]').fill("12");
  assert((await result.innerText()).includes("$111.88"), `editing the metal weight re-prices the quote: ${(await result.innerText()).replace(/\s+/g, " ")}`);
  await j.locator('input[value="Stacking ring (custom)"]').fill("Heavy stacking ring");
  await j.getByRole("button", { name: /Keep as a build sheet and product/i }).click();
  await j.waitForURL(/\/recipes\/[0-9a-f-]{36}$/);
  await j.getByRole("button", { name: /^Save build sheet$/i }).waitFor(); // past the loading outline
  const { data: kept } = await admin.from("menu_items").select("selling_price, recipes(name, labor_minutes, recipe_ingredients(quantity, waste_pct))").eq("org_id", jeweler.orgId).eq("name", "Heavy stacking ring").single();
  assert(Number(kept.selling_price) === 111.88 && kept.recipes.name === "Heavy stacking ring" && Number(kept.recipes.labor_minutes) === 45, `kept as a build sheet and a $111.88 product: ${JSON.stringify(kept)}`);
  assert(kept.recipes.recipe_ingredients.some((l) => Number(l.quantity) === 12 && l.waste_pct === null), "kept lines follow the material's loss %");
  const perPieceKept = (await j.locator("main").innerText()).replace(/\s+/g, " ").match(/÷ \d+ \w+ = \$[\d.]+ each/)?.[0] ?? "";
  assert(perPieceKept.includes("$39.1579"), `the kept build sheet costs what the quote said: ${perPieceKept}`);

  await j.goto(`${BASE}/ingredients`);
  await j.getByRole("heading", { name: "Materials" }).waitFor();
  const unitOptions = await j.locator("datalist option").evaluateAll((os) => os.map((o) => o.value));
  assert(unitOptions.includes("dwt") && unitOptions.includes("troy oz") && unitOptions.includes("precious_metal"), "materials grid suggests jewelry units and categories");
  assert((await j.getByRole("columnheader", { name: "Waste %" }).count()) === 1, "materials grid has a Waste % column");
  const ringRow = j.locator("tr", { has: j.locator('input[value="Sterling casting grain"]') });
  assert((await ringRow.locator('input[data-cell$=":4"]').inputValue()) === "5", "the sterling's waste % shows in the materials grid");

  await j.goto(`${BASE}/market`);
  assert((await j.getByText("Not available yet").count()) === 1, "/market says there's no data for jewelry rather than showing food prices");

  await j.goto(`${BASE}/settings`);
  const options = await j.locator("#business_type option").allInnerTexts();
  if (FOOD_ONLY) {
    assert(options.some((o) => /^Jewelry maker.*\(no longer offered\)$/.test(o)) && !options.some((o) => o.startsWith("Florist")), `food-only env: picker keeps the org's own switched-off industry only: ${options.join(" | ")}`);
  } else {
    assert(["Jewelry maker", "Florist", "Metal fabrication"].every((n) => options.some((o) => o.startsWith(n))), `default: picker offers the trades: ${options.join(" | ")}`);
    await j.locator("#business_type").selectOption("florist");
    await j.getByRole("button", { name: "Save settings" }).click();
    await j.getByText("Saved.").waitFor();
    await j.goto(`${BASE}/dashboard`);
    await j.locator("main h2").first().waitFor();
    nav = await navLinks(j);
    assert(nav.includes("Packages") && nav.includes("Arrangements") && nav.includes("Stems & supplies"), `switching to florist relabels at once: ${nav.join(", ")}`);
    const { data: org } = await admin.from("organizations").select("business_type").eq("id", jeweler.orgId).single();
    assert(org.business_type === "florist", "the switch is saved");
    const { count } = await admin.from("recipe_ingredients").select("id", { count: "exact", head: true }).eq("recipe_id", recipe.id);
    assert(count === 2, "switching industry leaves existing data alone");
  }

  // ---- the florist: stems by the bunch, spoilage, event quotes -------------
  // Roses arrive as "1 BN $14.50" with no pack size printed: unconvertible
  // until the rose says it comes 10 to a bunch (migration 028).
  const { data: fl, error: flErr } = await admin.from("ingredients").insert([
    { org_id: florist.orgId, name: "Red rose", base_unit: "stem", category: "cut_flower", current_unit_cost: null, waste_pct: 10 },
    { org_id: florist.orgId, name: "Eucalyptus", base_unit: "stem", category: "greens", current_unit_cost: 0.5, waste_pct: 10 },
    { org_id: florist.orgId, name: "Glass vase", base_unit: "each", category: "vase_container", current_unit_cost: 4, waste_pct: 0 },
  ]).select("id, name");
  if (flErr) throw new Error("insert florist materials failed: " + flErr.message);
  const [rose, euc, vase] = fl;
  const { data: arr, error: arrErr } = await admin.from("recipes").insert([
    { org_id: florist.orgId, name: "Centerpiece", batch_yield_qty: 1, batch_yield_unit: "arrangement", labor_minutes: 15, labor_rate_per_hour: 20 },
    { org_id: florist.orgId, name: "Bridal bouquet", batch_yield_qty: 1, batch_yield_unit: "bouquet", labor_minutes: 45, labor_rate_per_hour: 20 },
  ]).select("id, name");
  if (arrErr) throw new Error("insert arrangements failed: " + arrErr.message);
  const [centerpiece, bouquet] = arr;
  await admin.from("recipe_ingredients").insert([
    { org_id: florist.orgId, recipe_id: centerpiece.id, ingredient_id: rose.id, quantity: 6, unit: "stem" },
    { org_id: florist.orgId, recipe_id: centerpiece.id, ingredient_id: euc.id, quantity: 3, unit: "stem" },
    { org_id: florist.orgId, recipe_id: centerpiece.id, ingredient_id: vase.id, quantity: 1, unit: "each" },
    { org_id: florist.orgId, recipe_id: bouquet.id, ingredient_id: rose.id, quantity: 24, unit: "stem" },
    { org_id: florist.orgId, recipe_id: bouquet.id, ingredient_id: euc.id, quantity: 6, unit: "stem" },
  ]);
  const { data: flInv } = await admin.from("invoices").insert({ org_id: florist.orgId, file_storage_path: `test/florist-${suffix}.jpg` }).select("id").single();
  await admin.from("invoice_line_items").insert({
    org_id: florist.orgId, invoice_id: flInv.id, raw_text: "ROSE RED 50CM 1 BN", parsed_item_name: "Red rose", parsed_unit: "BN", parsed_unit_cost: 14.5,
    matched_ingredient_id: rose.id, match_status: "confirmed", price_note: "Can't convert \"BN\" to stem — price not applied",
  });

  const f = await login(florist.email);
  nav = await navLinks(f);
  assert(["Packages", "Arrangements", "Stems & supplies", "Quote"].every((n) => nav.includes(n)), `florist nav: ${nav.join(", ")}`);
  await f.goto(`${BASE}/ingredients`);
  await f.getByRole("heading", { name: "Stems & supplies" }).waitFor();
  assert((await f.getByRole("columnheader", { name: "Per bunch" }).count()) === 1 && (await f.getByRole("columnheader", { name: "Per box" }).count()) === 1, "florist materials grid has Per bunch and Per box");
  const roseRow = f.locator("tr", { has: f.locator('input[value="Red rose"]') });
  await roseRow.locator('input[data-cell$=":5"]').fill("10"); // name, category, unit, cost, waste, per bunch
  await f.getByRole("button", { name: /^Save 1 change$/ }).click();
  await f.getByText(/Saved —/).waitFor();
  const { data: roseNow } = await admin.from("ingredients").select("current_unit_cost, pack_sizes").eq("id", rose.id).single();
  assert(Number(roseNow.current_unit_cost) === 1.45 && roseNow.pack_sizes.bunch === 10, `"1 BN $14.50" becomes $1.45 a stem once the rose is 10 to a bunch: ${JSON.stringify(roseNow)}`);

  // Centerpiece: 6 roses + 3 eucalyptus at 10% spoilage, a $4 vase, 15 min at $20
  //   = 6/0.9×1.45 + 3/0.9×0.50 + 4 + 5 = $20.3333
  // Bridal bouquet: 24/0.9×1.45 + 6/0.9×0.50 + 15 = $57.0000
  await f.goto(`${BASE}/recipes/${centerpiece.id}`);
  await f.getByRole("button", { name: /^Save arrangement$/i }).waitFor();
  const cpCost = (await f.locator("main").innerText()).replace(/\s+/g, " ").match(/÷ \d+ \w+ = \$[\d.]+ each/)?.[0] ?? "(none)";
  assert(cpCost.includes("$20.3333"), `centerpiece costed per stem with 10% spoilage and labor: ${cpCost}`);

  // 10 centerpieces + 1 bouquet + $60 delivery + 60 min setup at $20
  //   = 203.3333 + 57 + 60 + 20 = $340.33; ÷ 0.35 → $972.39 at the 65% target.
  await f.goto(`${BASE}/quote?name=Rivera%20wedding&items=${centerpiece.id}:10,${bouquet.id}:1&delivery=60&setup_minutes=60&rate=20`);
  await f.getByRole("heading", { name: "Event quote" }).waitFor();
  const res = f.getByTestId("quote-result");
  assert((await f.getByTestId("event-total-cost").innerText()) === "$340.33", `event total cost: ${await f.getByTestId("event-total-cost").innerText()}`);
  assert((await res.innerText()).includes("$972.39"), `event suggested price at 65%: ${(await res.innerText()).replace(/\s+/g, " ")}`);
  await f.getByLabel("Your price ($, optional)").fill("900");
  assert((await f.getByTestId("quote-own-margin").innerText()).includes("62.19% margin, under your 65% target"), `own event price margin: ${await f.getByTestId("quote-own-margin").innerText()}`);
  await f.getByRole("button", { name: "Copy link to this quote" }).click();
  const copied = new URL(f.url());
  assert(copied.searchParams.get("items") === `${centerpiece.id}:10,${bouquet.id}:1` && copied.searchParams.get("price") === "900", `the copied link carries the quote: ${f.url()}`);
  await f.goto(`${BASE}/recipes/${centerpiece.id}`);
  assert((await f.getByRole("link", { name: "Quote a custom version" }).count()) === 0, "no jewelry piece-quote link on a florist's arrangement");

  // ---- step 5: printable event quote, cost sheet, price alert --------------
  await f.goto(copied.toString());
  await f.getByTestId("quote-result").waitFor();
  await f.getByRole("button", { name: "Printable quote" }).click();
  await f.waitForURL(/\/sheet\/event\?/);
  const evTotals = (await f.getByTestId("event-sheet-totals").innerText()).replace(/\s+/g, " ");
  assert(evTotals.includes("$340.33") && evTotals.includes("$972.39") && evTotals.includes("62.19%"), `printable event quote matches the screen: ${evTotals}`);
  assert((await f.locator("h1").innerText()) === "Rivera wedding", "printable quote carries the event name");

  // A package sold from the centerpiece: $65 → (65 − 20.3333) ÷ 65 = 68.72%.
  await admin.from("menu_items").insert({ org_id: florist.orgId, recipe_id: centerpiece.id, name: "Centerpiece", selling_price: 65 });
  await f.goto(`${BASE}/recipes/${centerpiece.id}`);
  await f.getByRole("link", { name: "Cost sheet" }).click();
  await f.waitForURL(/\/sheet\/[0-9a-f-]{36}$/);
  const sheet = (await f.getByTestId("cost-sheet").innerText()).replace(/\s+/g, " ");
  assert(sheet.includes("Red rose 6 stem 10% $1.45/stem $9.67") && sheet.includes("Cost per arrangement $20.33"), `cost sheet lists stems with spoilage and the cost per arrangement: ${sheet.slice(0, 400)}`);
  assert(sheet.includes("Overhead $0.00") && !sheet.includes("$-"), `no negative zero on the cost sheet: ${sheet.match(/Overhead \S+/)?.[0]}`);
  assert(sheet.includes("Centerpiece $65.00 $20.33 68.72% $58.10"), `cost sheet shows the package's price, cost, margin and the price for 65%: ${sheet}`);

  // Roses go up: "1 BN $18.00" → $1.80 a stem (+24%). The alert names the
  // package and how much margin it lost: 68.72% → (65 − 22.6667) ÷ 65 = 65.13%.
  await admin.from("invoice_line_items").insert({
    org_id: florist.orgId, invoice_id: flInv.id, raw_text: "ROSE RED 50CM 1 BN", parsed_item_name: "Red rose", parsed_unit: "BN", parsed_unit_cost: 18,
    matched_ingredient_id: rose.id, match_status: "confirmed",
  });
  await f.goto(`${BASE}/ingredients`);
  await f.getByRole("heading", { name: "Stems & supplies" }).waitFor();
  await f.locator("tr", { has: f.locator('input[value="Red rose"]') }).locator('input[data-cell$=":6"]').fill("25"); // per box: saving retries the rose's stuck prices
  await f.getByRole("button", { name: /^Save 1 change$/ }).click();
  await f.getByText(/Saved —/).waitFor();
  const { data: roseAlert } = await admin.from("price_alerts").select("id, pct_change").eq("ingredient_id", rose.id).single();
  assert(Math.round(Number(roseAlert.pct_change)) === 24, `a 24% rose rise raises an alert: ${JSON.stringify(roseAlert)}`);
  await f.goto(`${BASE}/alerts/${roseAlert.id}`);
  await f.getByText("Packages affected").waitFor();
  const alertText = (await f.locator("main").innerText()).replace(/\s+/g, " ");
  assert(alertText.includes("Red rose price change") && alertText.includes("PACKAGES HIT 1") && /Centerpiece Centerpiece \$65\.00 68\.7% .* 65\.1% .* ▼ 3\.59pp/.test(alertText), `alert shows the package losing margin: ${alertText.slice(0, 500)}`);
  assert(alertText.includes("of the arrangement's"), "the suggestion speaks the florist's words");


  // ---- the baker: today's app ---------------------------------------------
  const b = await login(baker.email);
  nav = await navLinks(b);
  assert(["Overview", "Menu", "Margins", "Recipes", "Ingredients", "Invoices", "Match lines", "Price alerts", "Market watch", "Settings"].every((n) => nav.includes(n)), `food nav unchanged: ${nav.join(", ")}`);
  assert(!nav.includes("Quote"), "food nav has no Quote");
  assert((await b.getByText(/Market watch ·/).count()) === 1, "food dashboard keeps Market Watch");
  await b.goto(`${BASE}/ingredients`);
  const foodUnits = await b.locator("datalist option").evaluateAll((os) => os.map((o) => o.value));
  assert(foodUnits.includes("gal") && !foodUnits.includes("dwt"), "food ingredient grid keeps its own unit list");
  assert((await b.getByRole("columnheader", { name: "Waste %" }).count()) === 0, "food ingredient grid has no Waste % column");
  const csv = await (await b.request.get(`${BASE}/api/ingredients/export`)).text();
  const csvHeader = csv.split(/\r?\n/)[0];
  assert(csvHeader === "id,name,category,base_unit,current_unit_cost,commodity_code", `food CSV export is the same file as before: ${csvHeader}`);

  // Like /admin, the page calls notFound() after the app's loading outline
  // has streamed, so the status stays 200; what matters is what they see.
  await b.goto(`${BASE}/quote`);
  await b.getByText("This page could not be found").waitFor();
  assert((await b.getByTestId("quote-result").count()) === 0, "food orgs get the not-found page for /quote, no calculator");
  await b.goto(`${BASE}/sheet/${recipe.id}`);
  await b.getByText("This page could not be found").waitFor();
  assert((await b.getByTestId("cost-sheet").count()) === 0, "food orgs get the not-found page for /sheet");

  // ---- signup ---------------------------------------------------------------
  const s = await browser.newPage();
  await s.goto(`${BASE}/signup?industry=jewelry`);
  const cards = (await s.getByTestId("industry-cards").locator("label").allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
  const picked = async () => s.locator('input[name="businessType"]:checked').getAttribute("value").catch(() => null);
  assert((await s.locator("form legend").first().innerText()).includes("What kind of business?"), "the industry picker is the first signup step");
  assert(["Home bakery", "Food truck", "Caterer"].every((n, i) => cards[i]?.startsWith(n)) && cards.at(-1).startsWith("Something else"), `food choices first, "Something else" last: ${cards.join(" | ")}`);
  if (FOOD_ONLY) {
    assert(!cards.some((c) => c.startsWith("Jewelry")) && (await picked()) === "", `food-only env: signup doesn't offer or preselect jewelry ("Something else" stays picked): ${cards.join(" | ")}`);
  } else {
    assert(["Jewelry maker beta", "Florist beta", "Metal fabrication beta"].every((n) => cards.some((c) => c.toLowerCase().startsWith(n.toLowerCase()))), `default: signup cards offer every type, trades as beta: ${cards.join(" | ")}`);
    assert((await picked()) === "jewelry", "?industry=jewelry preselects the jewelry card");
    await s.getByTestId("industry-cards").locator("label", { hasText: "Florist" }).click();
    assert((await picked()) === "florist", "clicking a card picks it");
  }

  console.log(`\nAll industry checks passed (${FOOD_ONLY ? "ENABLED_INDUSTRIES = food only" : "default: every industry offered"}).`);
} finally {
  await browser.close();
  try {
    execSync(process.platform === "win32" ? `taskkill /pid ${server.pid} /t /f` : `kill ${server.pid}`, { stdio: "ignore" });
  } catch {
    // already gone
  }
  for (const u of users) {
    await admin.from("organizations").delete().eq("id", u.orgId);
    await admin.auth.admin.deleteUser(u.id);
  }
  console.log("Cleanup done.");
}
