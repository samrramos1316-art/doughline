// Screenshots every app screen for one account, desktop and phone, for a
// visual review of the layout with real data.
// Run: node scripts/screenshot-app.mjs --email=… --password=… [--base=http://localhost:3000] [--only=dashboard,menu]
import fs from "node:fs";
import { chromium } from "playwright-core";

const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const BASE = arg("base") ?? "http://localhost:3000";
const OUT = "test-output/screens";
const only = arg("only")?.split(",");

const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  fs.mkdirSync(OUT, { recursive: true });
  const desk = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await desk.newPage();
  await page.goto(`${BASE}/login`);
  await page.getByLabel("Email").fill(arg("email"));
  await page.getByLabel("Password", { exact: true }).fill(arg("password"));
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(/dashboard/, { timeout: 60_000 });

  const { data: first } = await (async () => {
    // Find one of each detail page by following links from the lists.
    const pick = async (path, selector) => {
      await page.goto(`${BASE}${path}`);
      const href = await page.locator(selector).first().getAttribute("href").catch(() => null);
      return href;
    };
    return {
      data: {
        recipe: await pick("/recipes", 'main a[href^="/recipes/"]'),
        invoice: await pick("/invoices", 'main table a[href^="/invoices/"]'),
        alert: await pick("/alerts?tab=all", 'main a[href^="/alerts/"]'),
      },
    };
  })();

  const screens = [
    ["dashboard", "/dashboard"],
    ["add", "/add"],
    ["menu", "/menu"],
    ["margins", "/margins"],
    ["margins-ingredients", "/margins?view=ingredients"],
    ["recipes", "/recipes"],
    ["recipe", first.recipe],
    ["ingredients", "/ingredients"],
    ["ingredients-movers", "/ingredients?tab=movers"],
    ["ingredients-history", "/ingredients?tab=history"],
    ["invoices", "/invoices"],
    ["invoice", first.invoice],
    ["review", "/review"],
    ["alerts", "/alerts?tab=all"],
    ["alert", first.alert],
    ["market", "/market"],
    ["settings", "/settings"],
    ["import", "/invoices/import"],
    ["import-menu", "/onboarding/import?kind=menu"],
    ["import-recipe", "/onboarding/import?kind=recipe"],
    ["scan", "/invoices/scan"],
  ].filter(([name, path]) => path && (!only || only.includes(name)));

  const phone = await (await browser.newContext({ storageState: await desk.storageState(), viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage();
  for (const [name, path] of screens) {
    await page.goto(`${BASE}${path}`);
    await page.waitForLoadState("networkidle").catch(() => {});
    // Margins: open the first card so its breakdown is in the shot.
    if (name.startsWith("margins")) await page.locator("main details summary").first().click().catch(() => {});
    await page.screenshot({ path: `${OUT}/${name}-desktop.png`, fullPage: true });
    await phone.goto(`${BASE}${path}`);
    await phone.waitForLoadState("networkidle").catch(() => {});
    const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    await phone.screenshot({ path: `${OUT}/${name}-phone.png`, fullPage: true });
    console.log(`${name.padEnd(20)} ${path}${overflow > 0 ? `  ⚠ phone overflows by ${overflow}px` : ""}`);
  }
} finally {
  await browser.close();
}
