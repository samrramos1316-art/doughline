// Florist extras end to end, against a real server and the real database:
//   /seasons — prices month by month against last year, and before each
//   flower holiday (lib/costing/seasons.ts), every % worked out by hand.
//   /plan — an event quote's arrangements → stems to buy, with spoilage, in
//   bunches and boxes (lib/costing/orderPlan.ts).
//
// The price history is laid out around this year's holidays, so run it
// between Mother's Day and Christmas (the latest past holidays are then
// last Christmas, this Valentine's and this Mother's Day; next is Christmas).
// Needs a production build (`npx next build`); starts `next start` itself.
//   node scripts/test-florist-extras-e2e.mjs
import { spawn, execSync } from "node:child_process";
import { chromium } from "playwright-core";
import { getAdminClient, assert } from "./lib/supabaseTestEnv.mjs";
import { waitForServer } from "./lib/devServer.mjs";

const today = new Date().toISOString().slice(0, 10);
const Y = Number(today.slice(0, 4));
const may1 = new Date(Date.UTC(Y, 4, 1)).getUTCDay();
const mothersDay = `${Y}-05-${String(8 + ((7 - may1) % 7)).padStart(2, "0")}`;
if (!(today > mothersDay && today < `${Y}-12-25`)) {
  console.log(`Run this between Mother's Day (${mothersDay}) and Christmas: its price history is laid out around this year's holidays.`);
  process.exit(1);
}

const PORT = 3225;
const BASE = `http://localhost:${PORT}`;
const admin = getAdminClient();
const suffix = Date.now();
const password = "Test-Password-123!";
const users = [];
const text = async (loc) => (await loc.innerText()).replace(/\s+/g, " ");

async function makeUser(type) {
  const email = `florist-extras-${type}-${suffix}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { business_name: `Florist Extras ${type} ${suffix}`, business_type: type } });
  if (error) throw new Error("create user failed: " + error.message);
  const orgId = (await admin.from("profiles").select("org_id").eq("id", data.user.id).single()).data.org_id;
  users.push({ id: data.user.id, orgId });
  return { email, orgId };
}

const server = spawn("npx", ["next", "start", "--port", String(PORT)], { shell: true, stdio: "ignore" });
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  await waitForServer(BASE, 60_000);
  const florist = await makeUser("florist");
  const baker = await makeUser("bakery");
  const login = async (email) => {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
    page.setDefaultTimeout(30_000);
    await page.goto(`${BASE}/login`);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: /log in/i }).click();
    await page.waitForURL(/\/dashboard/);
    await page.locator("main h2").first().waitFor();
    return page;
  };
  const navLinks = async (page) => (await page.locator("aside nav a").allInnerTexts()).map((s) => s.replace(/\s*\d+$/, "").trim());

  // ---- /seasons ----------------------------------------------------------
  const { data: mats } = await admin.from("ingredients").insert([
    { org_id: florist.orgId, name: "Red rose 50cm", base_unit: "stem", current_unit_cost: 1.2, category: "cut_flower" },
    { org_id: florist.orgId, name: "Eucalyptus", base_unit: "stem", current_unit_cost: 0.5, category: "greens" },
  ]).select("id, name");
  const rose = mats.find((m) => m.name.startsWith("Red rose"));
  // Rose prices, two years back: a run-up before each holiday.
  const ROSE = [
    [`${Y - 2}-06-01`, 1.0], [`${Y - 2}-12-10`, 1.8], [`${Y - 1}-01-30`, 2.0], [`${Y - 1}-03-15`, 1.0],
    [`${Y - 1}-07-01`, 1.1], [`${Y - 1}-12-10`, 1.6], [`${Y}-01-30`, 2.4], [`${Y}-05-01`, 1.8], [`${Y}-07-01`, 1.2],
  ];
  await admin.from("ingredient_price_history").insert(ROSE.map(([effective_date, unit_cost]) => ({ org_id: florist.orgId, ingredient_id: rose.id, unit_cost, unit: "stem", effective_date, source: "manual" })));

  const f = await login(florist.email);
  assert((await navLinks(f)).includes("Seasons"), "florist nav has Seasons");
  await f.goto(`${BASE}/seasons`);
  await f.getByTestId("seasons-months").waitFor();
  const main = await text(f.locator("main"));
  assert(main.includes("NEXT HOLIDAY Christmas"), `next holiday is Christmas: ${main.slice(0, 300)}`);
  // Last Christmas: $1.60 in the 3 weeks before vs (2.0 + 1.0 + 1.1) / 3 = $1.3667 the rest of that year → +17.1%.
  const upcoming = await text(f.getByTestId("seasons-upcoming"));
  assert(upcoming.includes("Red rose 50cm $1.37 → $1.60") && upcoming.includes("17.1%"), `before Christmas last year: ${upcoming}`);
  assert(!/Eucalyptus/.test(main), "a material with no price history isn't listed");
  // Valentine's this year: $2.40 vs (1.0 + 1.1 + 1.6) / 3 = $1.2333 → +94.6%; the year before: $2.00 vs (1.0 + 1.8) / 2 → +42.9%.
  // Mother's Day: $1.80 vs (1.1 + 1.6 + 2.4) / 3 = $1.70 → +5.9%.
  const holidays = await text(f.getByTestId("seasons-holidays"));
  const up = holidays.toUpperCase(); // headers are styled in capitals
  assert(up.includes(`CHRISTMAS ${Y - 1}`) && up.includes(`VALENTINE'S DAY ${Y}`) && up.includes(`MOTHER'S DAY ${Y}`), `holiday columns: ${holidays.slice(0, 200)}`);
  // Christmas the year before: $1.80 vs $1.00 → +80.0%.
  assert(/17\.1%\s*year before: \+80\.0%/.test(holidays) && /94\.6%\s*year before: \+42\.9%/.test(holidays) && holidays.includes("5.9%"), `holiday lifts: ${holidays}`);
  // Months: Jan $2.40 against $2.00 last year (+20.0%); Jul $1.20 against $1.10 (+9.1%).
  const months = await text(f.getByTestId("seasons-months"));
  assert(/\$2\.40 \$2\.00 · ▲ 20\.0%/.test(months) && /\$1\.20 \$1\.10 · ▲ 9\.1%/.test(months), `month by month: ${months}`);
  await f.screenshot({ path: "test-output/seasons.png", fullPage: true });

  // ---- /plan --------------------------------------------------------------
  // Roses lose 10% and come in bunches of 10 or boxes of 25; eucalyptus 10%,
  // bunches of 10. A centerpiece is 6 roses + 3 eucalyptus; a batch of 4
  // boutonnieres is 4 roses at that line's own 20% loss.
  const euc = mats.find((m) => m.name === "Eucalyptus");
  await admin.from("ingredients").update({ waste_pct: 10, pack_sizes: { bunch: 10, box: 25 } }).eq("id", rose.id);
  await admin.from("ingredients").update({ waste_pct: 10, pack_sizes: { bunch: 10 } }).eq("id", euc.id);
  const { data: arr } = await admin.from("recipes").insert([
    { org_id: florist.orgId, name: "Centerpiece", batch_yield_qty: 1, batch_yield_unit: "centerpiece" },
    { org_id: florist.orgId, name: "Boutonniere", batch_yield_qty: 4, batch_yield_unit: "boutonnieres" },
  ]).select("id, name");
  const cp = arr.find((a) => a.name === "Centerpiece");
  const bt = arr.find((a) => a.name === "Boutonniere");
  await admin.from("recipe_ingredients").insert([
    { org_id: florist.orgId, recipe_id: cp.id, ingredient_id: rose.id, quantity: 6, unit: "stem" },
    { org_id: florist.orgId, recipe_id: cp.id, ingredient_id: euc.id, quantity: 3, unit: "stem" },
    { org_id: florist.orgId, recipe_id: bt.id, ingredient_id: rose.id, quantity: 4, unit: "stem", waste_pct: 20 },
  ]);
  assert((await navLinks(f)).includes("Order plan"), "florist nav has Order plan");
  // From an event quote of 10 centerpieces and 6 boutonnieres.
  await f.goto(`${BASE}/quote?name=Rivera%20wedding&items=${cp.id}:10,${bt.id}:6`);
  await f.getByRole("button", { name: "Plan what to buy" }).click();
  await f.waitForURL(/\/plan\?/);
  const plan = f.getByTestId("order-plan");
  await plan.getByText("Red rose 50cm").waitFor();
  // Roses: 60 + 6 = 66 used; 60/0.9 + 6/0.8 = 74.17 → 75 → exactly 3 boxes of 25 ($90.00 at $1.20).
  const roseRow = await text(plan.locator('tr[data-name="Red rose 50cm"]'));
  assert(roseRow.includes("66 stem") && roseRow.includes("75 stem +10–20% loss") && roseRow.includes("3 boxes of 25") && roseRow.includes("or 8 bunches of 10 (5 spare)") && roseRow.includes("$90.00"), `roses to buy: ${roseRow}`);
  // Eucalyptus: 30 used; 30/0.9 = 33.33 → 34 → 4 bunches of 10, 6 spare ($17.00 at $0.50).
  const eucRow = await text(plan.locator('tr[data-name="Eucalyptus"]'));
  assert(eucRow.includes("30 stem") && eucRow.includes("34 stem") && eucRow.includes("4 bunches of 10 (6 spare)") && eucRow.includes("$17.00"), `eucalyptus to buy: ${eucRow}`);
  assert((await text(f.getByTestId("order-plan-total"))) === "$107.00", "plan total at today's prices: $107.00");
  assert((await text(f.locator("main"))).toUpperCase().includes("RIVERA WEDDING"), "the plan keeps the event's name");
  await f.screenshot({ path: "test-output/order-plan.png", fullPage: true });

  const b = await login(baker.email);
  const foodNav = await navLinks(b);
  assert(!foodNav.includes("Seasons") && !foodNav.includes("Order plan"), "food nav has no Seasons or Order plan");
  for (const path of ["/seasons", "/plan"]) {
    await b.goto(`${BASE}${path}`);
    assert(/could not be found|404/i.test(await b.locator("body").innerText()), `food orgs get the not-found page for ${path}`);
  }

  console.log("\nAll florist extras checks passed.");
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
