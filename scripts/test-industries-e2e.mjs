// Industry profiles end to end (lib/industries): labels, defaults, costing
// with waste and labor, Market Watch gating, the Settings picker and the
// ENABLED_INDUSTRIES gate — against a real server and the real database.
//
// Needs a production build (`npx next build`); starts `next start` itself.
//   node scripts/test-industries-e2e.mjs            # trades enabled
//   node scripts/test-industries-e2e.mjs --default  # ENABLED_INDUSTRIES unset
import { spawn, execSync } from "node:child_process";
import { chromium } from "playwright-core";
import { getAdminClient, assert } from "./lib/supabaseTestEnv.mjs";
import { waitForServer } from "./lib/devServer.mjs";

const DEFAULT_ENV = process.argv.includes("--default");
const PORT = DEFAULT_ENV ? 3221 : 3220;
const BASE = `http://localhost:${PORT}`;
const ALL = "bakery,food_truck,caterer,jewelry,florist,metalworking";
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

const env = { ...process.env, ENABLED_INDUSTRIES: DEFAULT_ENV ? "" : ALL };
const server = spawn("npx", ["next", "start", "--port", String(PORT)], { shell: true, stdio: "ignore", env });
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  await waitForServer(BASE, 60_000);
  const jeweler = await makeUser("jewelry");
  const baker = await makeUser("bakery");

  // A build sheet: 8 g sterling ($1.20/g) with 5% waste, a $6 stone, 45 min
  // at $24/h; sold as a $95 ring → cost 8/0.95×1.20 + 6 + 18 = $34.1053.
  const { data: ings, error: ingErr } = await admin.from("ingredients").insert([
    { org_id: jeweler.orgId, name: "Sterling casting grain", base_unit: "g", category: "precious_metal", current_unit_cost: 1.2 },
    { org_id: jeweler.orgId, name: "White sapphire 3mm", base_unit: "each", category: "stone", current_unit_cost: 6 },
  ]).select("id, name");
  if (ingErr) throw new Error("insert ingredients failed: " + ingErr.message);
  const { data: recipe, error: recipeErr } = await admin.from("recipes").insert({
    org_id: jeweler.orgId, name: "Stacking ring", batch_yield_qty: 1, batch_yield_unit: "rings", labor_minutes: 45, labor_rate_per_hour: 24,
  }).select("id").single();
  if (recipeErr) throw new Error("insert recipe failed: " + recipeErr.message);
  const { error: riErr } = await admin.from("recipe_ingredients").insert([
    { org_id: jeweler.orgId, recipe_id: recipe.id, ingredient_id: ings[0].id, quantity: 8, unit: "g", waste_pct: 5 },
    { org_id: jeweler.orgId, recipe_id: recipe.id, ingredient_id: ings[1].id, quantity: 1, unit: "each", waste_pct: 0 },
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
  assert((await j.getByRole("columnheader", { name: "Waste %" }).count()) > 0, "build sheet shows the Waste % column");
  assert(await j.locator("details").first().evaluate((d) => d.open), "Labor & overhead starts open (show_labor_by_default)");
  assert((await j.getByText("A blank Waste % uses your usual 5%").count()) === 1, "new lines default to the jewelry waste (5%)");
  const perPiece = (await j.locator("main").innerText()).replace(/\s+/g, " ").match(/÷ \d+ \w+ = \$[\d.]+ each/)?.[0] ?? "(no batch cost panel)";
  assert(perPiece.includes("$34.1053"), `build sheet cost with waste and labor: ${perPiece}`);

  await j.goto(`${BASE}/margins`);
  assert((await j.getByText("64.1%").count()) > 0, "the ring's margin (64.1%) includes waste and labor");

  await j.goto(`${BASE}/ingredients`);
  await j.getByRole("heading", { name: "Materials" }).waitFor();
  const unitOptions = await j.locator("datalist option").evaluateAll((os) => os.map((o) => o.value));
  assert(unitOptions.includes("dwt") && unitOptions.includes("troy oz") && unitOptions.includes("precious_metal"), "materials grid suggests jewelry units and categories");

  await j.goto(`${BASE}/market`);
  assert((await j.getByText("Not available yet").count()) === 1, "/market says there's no data for jewelry rather than showing food prices");

  await j.goto(`${BASE}/settings`);
  const options = await j.locator("#business_type option").allInnerTexts();
  if (DEFAULT_ENV) {
    assert(options.some((o) => o.includes("Jewelry maker (no longer offered)")) && !options.some((o) => o.startsWith("Florist")), `default env: picker keeps the org's own hidden industry only: ${options.join(" | ")}`);
  } else {
    assert(["Jewelry maker", "Florist", "Metal fabrication"].every((n) => options.includes(n)), `all enabled: picker offers the trades: ${options.join(" | ")}`);
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

  // ---- the baker: today's app ---------------------------------------------
  const b = await login(baker.email);
  nav = await navLinks(b);
  assert(["Overview", "Menu", "Margins", "Recipes", "Ingredients", "Invoices", "Match lines", "Price alerts", "Market watch", "Settings"].every((n) => nav.includes(n)), `food nav unchanged: ${nav.join(", ")}`);
  assert((await b.getByText(/Market watch ·/).count()) === 1, "food dashboard keeps Market Watch");
  await b.goto(`${BASE}/ingredients`);
  const foodUnits = await b.locator("datalist option").evaluateAll((os) => os.map((o) => o.value));
  assert(foodUnits.includes("gal") && !foodUnits.includes("dwt"), "food ingredient grid keeps its own unit list");

  // ---- signup ---------------------------------------------------------------
  const s = await browser.newPage();
  await s.goto(`${BASE}/signup?industry=jewelry`);
  const signupOptions = await s.locator("#businessType option").allInnerTexts();
  const firstLabel = await s.locator("form label").first().innerText();
  assert(firstLabel.includes("What kind of business?"), "the industry picker is the first signup step");
  if (DEFAULT_ENV) {
    assert(!signupOptions.includes("Jewelry maker") && (await s.locator("#businessType").inputValue()) === "", "default env: signup doesn't offer or preselect jewelry");
  } else {
    assert(signupOptions.includes("Jewelry maker") && (await s.locator("#businessType").inputValue()) === "jewelry", "enabled: ?industry=jewelry preselects it");
  }

  console.log(`\nAll industry checks passed (${DEFAULT_ENV ? "default ENABLED_INDUSTRIES" : "all industries enabled"}).`);
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
