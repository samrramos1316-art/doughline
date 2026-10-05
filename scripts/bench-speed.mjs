// How long each app page takes, signed in as the demo account.
//
//   server: time for the server to send the whole page (fetch, median of 3)
//   click:  time from clicking the sidebar link until the new page shows
//
// Run: node scripts/bench-speed.mjs [--base=https://…]
import { chromium } from "playwright-core";

const BASE = process.argv.find((a) => a.startsWith("--base="))?.slice(7) ?? "https://doughtally.app";
const PAGES = [
  ["/dashboard", "Overview"],
  ["/menu", "Menu"],
  ["/margins", "Margins"],
  ["/recipes", "Recipes"],
  ["/ingredients", "Ingredients"],
  ["/invoices", "Invoices"],
  ["/review", "Match lines"],
  ["/alerts", "Price alerts"],
  ["/market", "Market watch"],
  ["/settings", "Settings"],
];
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60_000);
  await page.goto(`${BASE}/login`);
  await page.getByLabel("Email").fill("demo@doughtally.test");
  await page.getByLabel("Password", { exact: true }).fill("DoughtallyDemo123!");
  await page.getByRole("button", { name: /log in/i }).click();
  await page.waitForURL(/\/dashboard/);

  console.log(`${BASE}\npage           server   click`);
  const rows = [];
  for (const [path, label] of PAGES) {
    const server = [];
    for (let i = 0; i < 3; i++) {
      const t = performance.now();
      const res = await ctx.request.get(`${BASE}${path}`);
      await res.body();
      server.push(performance.now() - t);
    }
    // Click through from another page, as a person would.
    await page.goto(`${BASE}${path === "/dashboard" ? "/settings" : "/dashboard"}`);
    await page.waitForLoadState("networkidle");
    const t = performance.now();
    await page.locator("aside").getByRole("link", { name: label, exact: true }).first().click();
    await page.waitForURL((u) => u.pathname === path);
    await page.waitForLoadState("networkidle");
    const click = performance.now() - t;
    rows.push([path, median(server), click]);
    console.log(`${path.padEnd(14)} ${String(Math.round(median(server))).padStart(5)}ms ${String(Math.round(click)).padStart(6)}ms`);
  }
  const avg = (i) => Math.round(rows.reduce((s, r) => s + r[i], 0) / rows.length);
  console.log(`${"average".padEnd(14)} ${String(avg(1)).padStart(5)}ms ${String(avg(2)).padStart(6)}ms`);
} finally {
  await browser.close();
}
