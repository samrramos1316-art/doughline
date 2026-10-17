// Build step 11 end to end with live data: USDA MyMarketNews + FAO Food Price
// Index → commodity_price_series → Market Watch, printing real rows:
//
//   1. GET /api/cron/ingest-market-data refuses callers without CRON_SECRET,
//      then ingests ~400 days of every tracked series.
//   2. Stored rows, and one USDA row cross-checked against a direct call to
//      the USDA API (Basic auth, key as username) — same date, same number.
//   3. Re-running the job is idempotent (row counts unchanged).
//   4. A bakery's ingredients mapped to series (override, name, category).
//   5. The % change Market Watch shows, recomputed independently from the
//      stored rows, for the default 90-day window and the 30-day one;
//      screenshots of /market and the dashboard panel.
//   6. A fabrication shop: only the BLS steel and aluminum series, its
//      materials linked by category and name, % changes recomputed.
//
// commodity_price_series is shared reference data, so its rows are kept
// (the job upserts them daily anyway); the test org is deleted.
// Run: node scripts/test-market-e2e.mjs
import fs from "node:fs";
import { chromium } from "playwright-core";
import { loadEnv, getAdminClient, getAnonClient, assert } from "./lib/supabaseTestEnv.mjs";
import { startDevServer, waitForServer, killDevServer } from "./lib/devServer.mjs";

loadEnv();
for (const key of ["USDA_API_KEY", "CRON_SECRET", "SUPABASE_SECRET_KEY"]) if (!process.env[key]) throw new Error(`Set ${key} in .env.local`);

const PORT = 3107;
const BASE_URL = `http://localhost:${PORT}`;
const PROJECT_REF = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname.split(".")[0];
const AUTH_COOKIE_NAME = `sb-${PROJECT_REF}-auth-token`;
const OUT_DIR = "test-output/market";
const DAY = 86_400_000;

const admin = getAdminClient();
const email = `market-e2e-${Date.now()}@example.com`;
const password = "Test-Password-123!";
let userId, orgId, fabUserId, fabOrgId, devServer, browser;

const banner = (t) => console.log(`\n${"=".repeat(80)}\n${t}\n${"=".repeat(80)}`);
const cron = (headers = {}) => fetch(`${BASE_URL}/api/cron/ingest-market-data?days=400`, { headers });
async function seriesCounts() {
  const { data } = await admin.from("commodity_price_series").select("commodity_code");
  const c = {};
  for (const r of data) c[r.commodity_code] = (c[r.commodity_code] ?? 0) + 1;
  return Object.fromEntries(Object.entries(c).sort(([a], [b]) => a.localeCompare(b)));
}
// Independent restatement of lib/market/trends.ts: latest point vs. the
// latest point on or before (latest − window).
function expectedTrend(points, windowDays) {
  const cur = points[points.length - 1];
  const cutoff = new Date(Date.parse(cur.period_date) - windowDays * DAY).toISOString().slice(0, 10);
  const base = [...points].reverse().find((p) => p.period_date <= cutoff);
  if (!base) return null;
  const raw = ((Number(cur.value) - Number(base.value)) / Number(base.value)) * 100;
  return { cur, base, raw, pct: Math.round(raw * 10) / 10 };
}

try {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const f of fs.readdirSync(OUT_DIR)) fs.rmSync(`${OUT_DIR}/${f}`);
  devServer = startDevServer(PORT);
  await waitForServer(BASE_URL, 120_000);

  // ------------------------------------------------------------------ 1
  banner("STAGE 1 — the ingestion job");
  const noAuth = await cron();
  const wrong = await cron({ Authorization: "Bearer not-the-secret" });
  console.log(`no Authorization → ${noAuth.status}; wrong secret → ${wrong.status}`);
  assert(noAuth.status === 401 && wrong.status === 401, "cron route refuses callers without CRON_SECRET");
  const before = await seriesCounts();
  const run = await cron({ Authorization: `Bearer ${process.env.CRON_SECRET}` });
  const body = await run.json();
  console.log(`with CRON_SECRET → ${run.status}, ${body.seconds}s`);
  for (const s of body.series) {
    console.log(`  ${s.commodity_code.padEnd(22)} ${s.source.padEnd(9)} ${String(s.points).padStart(4)} points  ${s.first} → ${s.latest?.period_date} latest ${s.latest?.value}${s.error ? `  ERROR ${s.error}` : ""}`);
  }
  assert(run.status === 200 && body.ok, "every source ingested without error");
  const codes = body.series.map((s) => s.commodity_code);
  assert(["eggs_large_white", "butter", "wheat"].every((c) => codes.includes(c)) && codes.filter((c) => c.startsWith("fao_")).length === 6,
    "3 USDA series + 6 FAO series ingested");
  assert(["steel", "aluminum"].every((c) => body.series.some((s) => s.commodity_code === c && s.source === "bls_ppi" && s.points > 0)), "BLS steel and aluminum producer price series ingested");

  // ------------------------------------------------------------------ 2
  banner("STAGE 2 — stored rows, checked against USDA directly");
  for (const code of ["eggs_large_white", "butter", "wheat", "fao_dairy_index"]) {
    const { data } = await admin.from("commodity_price_series").select("*").eq("commodity_code", code).order("period_date", { ascending: false }).limit(2);
    console.log(`SELECT * FROM commodity_price_series WHERE commodity_code='${code}' ORDER BY period_date DESC LIMIT 2;`);
    for (const r of data) console.log("  " + JSON.stringify(r));
  }
  const { data: eggLatest } = await admin.from("commodity_price_series").select("*").eq("commodity_code", "eggs_large_white").order("period_date", { ascending: false }).limit(1).single();
  const [y, m, d] = eggLatest.period_date.split("-");
  const auth = "Basic " + Buffer.from(`${process.env.USDA_API_KEY}:`).toString("base64");
  const direct = await fetch(`https://marsapi.ams.usda.gov/services/v1.2/reports/2843/Report%20Detail%20Weighted?q=${encodeURIComponent(`report_begin_date=${m}/${d}/${y}:${m}/${d}/${y}`)}`, { headers: { Authorization: auth } });
  const directRow = (await direct.json()).results.find((r) => r.egg_type === "Graded Loose" && r.environment === "Caged" && r.color === "White" && r.class === "Large");
  console.log(`\nDirect USDA call (report 2843, ${m}/${d}/${y}, Graded Loose · Caged · White · Large):\n  ${JSON.stringify({ report_date: directRow.report_date, wtd_avg_price: directRow.wtd_avg_price, price_unit: directRow.price_unit, volume: directRow.volume, volume_unit: directRow.volume_unit })}`);
  console.log(`Stored: $${eggLatest.value}/dozen on ${eggLatest.period_date} (${directRow.wtd_avg_price} ¢ ÷ 100)`);
  assert(Math.abs(Number(eggLatest.value) - Number(directRow.wtd_avg_price) / 100) < 1e-9, "stored egg value equals USDA's own number for that date");

  const { data: steelLatest } = await admin.from("commodity_price_series").select("*").eq("commodity_code", "steel").order("period_date", { ascending: false }).limit(1).single();
  const [sy, sm] = steelLatest.period_date.split("-");
  const bls = await (await fetch("https://api.bls.gov/publicAPI/v2/timeseries/data/", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ seriesid: ["WPU1017"], startyear: sy, endyear: sy }),
  })).json();
  const blsRow = bls.Results.series[0].data.find((p) => p.year === sy && p.period === `M${sm}`);
  console.log(`\nDirect BLS call (WPU1017, steel mill products, ${sy}-M${sm}): ${JSON.stringify({ value: blsRow.value, footnotes: blsRow.footnotes.map((f) => f.text).filter(Boolean) })}`);
  console.log(`Stored: ${steelLatest.value} (index) for ${steelLatest.period_date}`);
  assert(Number(steelLatest.value) === Number(blsRow.value), "stored steel index equals BLS's own number for that month");

  // ------------------------------------------------------------------ 3
  banner("STAGE 3 — re-running is idempotent");
  const mid = await seriesCounts();
  const rerun = await cron({ Authorization: `Bearer ${process.env.CRON_SECRET}` });
  const after = await seriesCounts();
  console.log(`rows per series before first run: ${JSON.stringify(before)}\nafter first run: ${JSON.stringify(mid)}\nafter second run (${rerun.status}): ${JSON.stringify(after)}`);
  assert(JSON.stringify(mid) === JSON.stringify(after), "second run adds no duplicate rows");

  // ------------------------------------------------------------------ 4
  banner("STAGE 4 — a bakery's ingredients mapped to series");
  const { data: created } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { business_name: "Sweet Crumb Bakery (market e2e)" } });
  userId = created.user.id;
  orgId = (await admin.from("profiles").select("org_id").eq("id", userId).single()).data.org_id;
  const session = (await getAnonClient().auth.signInWithPassword({ email, password })).data.session;
  const ING = [
    ["All-Purpose Flour", "dry_goods", null], ["Bread Flour", "dry_goods", null], ["Unsalted Butter", "dairy", null],
    ["Large Eggs", "dairy", null], ["Whole Milk", "dairy", null], ["Heavy Cream", "dairy", null],
    ["Granulated Sugar", "dry_goods", null], ["Kosher Salt", "dry_goods", null], ["Semi-Sweet Chocolate Chips", "dry_goods", "fao_sugar_index"],
  ];
  await admin.from("ingredients").insert(ING.map(([name, category, commodity_code]) => ({ org_id: orgId, name, category, base_unit: "lb", commodity_code })));
  console.log("ingredients: " + ING.map(([n, c, o]) => `${n} (${c}${o ? `, commodity_code override ${o}` : ""})`).join("; "));

  // ------------------------------------------------------------------ 5
  banner("STAGE 5 — the % change Market Watch displays");
  browser = await chromium.launch({ channel: "msedge", headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addCookies([{ name: AUTH_COOKIE_NAME, value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"), domain: "localhost", path: "/", sameSite: "Lax" }]);
  const page = await context.newPage();

  for (const windowDays of [90, 30]) {
    await page.goto(`${BASE_URL}/market?window=${windowDays}`);
    await page.getByRole("heading", { name: "Market Watch" }).first().waitFor();
    const cards = await page.getByTestId("market-trend").evaluateAll((els) => els.map((e) => ({ code: e.dataset.code, text: e.innerText.replace(/\s+/g, " ").trim() })));
    console.log(`\n/market?window=${windowDays} — ${cards.length} cards:`);
    for (const c of cards) console.log(`  [${c.code}] ${c.text}`);
    await page.screenshot({ path: `${OUT_DIR}/market-${windowDays}d.png`, fullPage: true });
    console.log(`   [screenshot] ${OUT_DIR}/market-${windowDays}d.png`);

    for (const code of ["eggs_large_white", "butter", "wheat", "fao_dairy_index", "fao_sugar_index"]) {
      const { data: pts } = await admin.from("commodity_price_series").select("period_date, value").eq("commodity_code", code).order("period_date");
      const e = expectedTrend(pts, windowDays);
      const card = cards.find((c) => c.code === code);
      if (!e) {
        assert(!card, `${code}: not enough history for ${windowDays} days, so no card`);
        continue;
      }
      const pctText = `${e.pct > 0 ? "+" : ""}${e.pct.toFixed(1)}%`;
      console.log(`  ${code}: (${e.cur.value} on ${e.cur.period_date} − ${e.base.value} on ${e.base.period_date}) ÷ ${e.base.value} = ${e.raw.toFixed(4)}% → ${pctText}`);
      assert(card && card.text.includes(pctText), `${code} card shows ${pctText} over ${windowDays} days`);
    }
    if (windowDays === 90) {
      const eggs = cards.find((c) => c.code === "eggs_large_white").text;
      const wheat = cards.find((c) => c.code === "wheat").text;
      const sugar = cards.find((c) => c.code === "fao_sugar_index").text;
      assert(/Large Eggs/.test(eggs) && /All-Purpose Flour, Bread Flour/.test(wheat), "eggs and flours linked by name to their series");
      assert(/Granulated Sugar/.test(sugar) && /Semi-Sweet Chocolate Chips/.test(sugar) && !cards.some((c) => /Kosher Salt/.test(c.text)),
        "sugar by name, chocolate chips by override; salt follows nothing");
      assert(cards.findIndex((c) => c.code === "fao_food_price_index") > cards.findIndex((c) => c.code === "wheat"), "series touching this kitchen sort before ambient ones");
      assert(!cards.some((c) => c.code === "steel" || c.code === "aluminum"), "a bakery sees no metal series");
    }
  }

  // ------------------------------------------------------------------ 6
  banner("STAGE 6 — a fabrication shop sees steel and aluminum, nothing else");
  const fabEmail = `market-e2e-fab-${Date.now()}@example.com`;
  const { data: fabUser } = await admin.auth.admin.createUser({ email: fabEmail, password, email_confirm: true, user_metadata: { business_name: "Iron Works (market e2e)", business_type: "metalworking" } });
  fabUserId = fabUser.user.id;
  fabOrgId = (await admin.from("profiles").select("org_id").eq("id", fabUserId).single()).data.org_id;
  const MATERIALS = [
    ["A36 steel flat bar 1/4 x 2 in", "bar_stock"], ["Square tube 2x2 11ga", "tube_pipe"], ["6061 aluminum sheet 0.125 in", "sheet_plate"],
    ["Hex bolts 3/8-16 x 1", "fasteners"], ["Cutting oil", "consumables"],
  ];
  await admin.from("ingredients").insert(MATERIALS.map(([name, category]) => ({ org_id: fabOrgId, name, category, base_unit: "each" })));
  const fabSession = (await getAnonClient().auth.signInWithPassword({ email: fabEmail, password })).data.session;
  const fabContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await fabContext.addCookies([{ name: AUTH_COOKIE_NAME, value: "base64-" + Buffer.from(JSON.stringify(fabSession)).toString("base64url"), domain: "localhost", path: "/", sameSite: "Lax" }]);
  const fab = await fabContext.newPage();
  await fab.goto(`${BASE_URL}/market?window=90`);
  await fab.getByRole("heading", { name: "Market Watch" }).first().waitFor();
  const fabCards = await fab.getByTestId("market-trend").evaluateAll((els) => els.map((e) => ({ code: e.dataset.code, text: e.innerText.replace(/\s+/g, " ").trim() })));
  for (const c of fabCards) console.log(`  [${c.code}] ${c.text}`);
  await fab.screenshot({ path: `${OUT_DIR}/market-fabrication.png`, fullPage: true });
  assert(fabCards.map((c) => c.code).sort().join() === "aluminum,steel", `fabricator sees only steel and aluminum: ${fabCards.map((c) => c.code)}`);
  for (const code of ["steel", "aluminum"]) {
    const { data: pts } = await admin.from("commodity_price_series").select("period_date, value").eq("commodity_code", code).order("period_date");
    const e = expectedTrend(pts, 90);
    const pctText = `${e.pct > 0 ? "+" : ""}${e.pct.toFixed(1)}%`;
    console.log(`  ${code}: (${e.cur.value} on ${e.cur.period_date} − ${e.base.value} on ${e.base.period_date}) ÷ ${e.base.value} → ${pctText}`);
    assert(fabCards.find((c) => c.code === code).text.includes(pctText), `${code} card shows ${pctText} over 90 days`);
  }
  const steelCard = fabCards.find((c) => c.code === "steel").text;
  const aluCard = fabCards.find((c) => c.code === "aluminum").text;
  const steelUp = !/roughly flat/.test(steelCard);
  assert(/BLS Producer Price Index/.test(steelCard), "the card names BLS as its source");
  assert(!steelUp || (/A36 steel flat bar/.test(steelCard) && /Square tube/.test(steelCard) && !/6061/.test(steelCard)), "steel stock linked to steel, the aluminum sheet not");
  assert(/roughly flat/.test(aluCard) || /6061 aluminum sheet/.test(aluCard), "aluminum sheet linked to aluminum");
  assert(!fabCards.some((c) => /Hex bolts|Cutting oil/.test(c.text)), "fasteners and cutting oil follow nothing");
  assert(/US producer prices \(BLS\), monthly/.test(await fab.locator("main").innerText()), "the page names its source");

  await page.goto(`${BASE_URL}/dashboard`);
  const panel = page.getByRole("region", { name: "Market Watch" });
  await panel.waitFor();
  console.log(`\n/dashboard panel: ${(await panel.innerText()).replace(/\s+/g, " ").trim()}`);
  await page.screenshot({ path: `${OUT_DIR}/dashboard.png`, fullPage: true });
  console.log(`   [screenshot] ${OUT_DIR}/dashboard.png`);
  const panelText = (await panel.innerText()).replace(/\s+/g, " ");
  assert((panelText.match(/\bYour /g) ?? []).length === 4 && !/FAO index\) (?!Your)|Food prices overall|Steel|Aluminum/.test(panelText),
    "dashboard shows up to 4 series that touch this kitchen, none ambient, none metal");
  await fab.goto(`${BASE_URL}/dashboard`);
  const fabPanel = (await fab.getByRole("region", { name: "Market Watch" }).innerText()).replace(/\s+/g, " ");
  console.log(`fabricator /dashboard panel: ${fabPanel}`);
  assert(/Steel mill products/.test(fabPanel) && /Aluminum mill shapes/.test(fabPanel) && !/Eggs|Butter|Wheat|FAO/.test(fabPanel), "fabricator dashboard shows steel and aluminum only");

  console.log("\nMarket end-to-end test passed.");
} finally {
  if (browser) await browser.close();
  killDevServer(devServer);
  if (orgId) {
    await admin.from("organizations").delete().eq("id", orgId);
    await admin.auth.admin.deleteUser(userId);
    console.log("\nTest org and user deleted (commodity_price_series rows kept — shared reference data).");
  }
  if (fabOrgId) {
    await admin.from("organizations").delete().eq("id", fabOrgId);
    await admin.auth.admin.deleteUser(fabUserId);
  }
}
