// Screenshots of the landing page at several scroll depths (desktop and
// phone), scrolled with the mouse wheel so the smooth-scroll and scroll-driven
// animations run as they would for a visitor. Also opens the phone menu and
// reports console errors.
//
// Run: node scripts/screenshot-landing.mjs [--base=http://localhost:3000]
import fs from "node:fs";
import { chromium } from "playwright-core";

const BASE = process.argv.find((a) => a.startsWith("--base="))?.slice(7) ?? "http://localhost:3000";
const OUT = "test-output/landing";
fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) fs.rmSync(`${OUT}/${f}`);

const browser = await chromium.launch({ channel: "msedge", headless: true });
const errors = [];
async function tour(name, opts, stops) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  page.on("console", (m) => m.type() === "error" && errors.push(`${name}: ${m.text()}`));
  page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 180_000 });
  await page.waitForTimeout(2800);
  await page.screenshot({ path: `${OUT}/${name}-00-hero.png` });
  const height = opts.viewport.height;
  let shot = 1;
  for (const screens of stops) {
    // Wheel in small steps so Lenis and the scrubbed timelines follow along.
    const target = screens * height;
    let y = await page.evaluate(() => window.scrollY);
    while (y < target) {
      await page.mouse.wheel(0, 240);
      await page.waitForTimeout(40);
      y = await page.evaluate(() => window.scrollY);
      if (y >= (await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)) - 2) break;
    }
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/${name}-${String(shot++).padStart(2, "0")}-at-${screens}.png` });
  }
  return { ctx, page };
}

const { page: desk } = await tour("desktop", { viewport: { width: 1440, height: 900 } }, [0.5, 1, 1.6, 2.3, 3, 3.8, 4.6, 5.5, 6.5, 7.5, 8.5, 9.5]);
const total = await desk.evaluate(() => document.documentElement.scrollHeight);
console.log(`desktop page height: ${total}px (${(total / 900).toFixed(1)} screens)`);
await desk.locator("#product").scrollIntoViewIfNeeded();
await desk.waitForTimeout(800);
for (let i = 0; i < 2; i++) {
  await desk.getByRole("button", { name: "Next", exact: true }).click();
  await desk.waitForTimeout(900);
}
await desk.locator("#product").screenshot({ path: `${OUT}/desktop-tour-after-2-nexts.png` });
console.log(`tour counter after 2 × Next: ${await desk.locator("#product").getByText(/\/ 05/).innerText()}`);
const { page: phone } = await tour(
  "phone",
  { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  [0.8, 1.6, 2.6, 3.6, 5, 6.5, 8, 10, 12, 14],
);
await phone.evaluate(() => window.scrollTo(0, 0));
await phone.getByRole("button", { name: "Open menu" }).click();
await phone.waitForTimeout(900);
await phone.screenshot({ path: `${OUT}/phone-menu-open.png` });
const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
console.log(`phone sideways overflow: ${overflow}px`);
await phone.getByRole("link", { name: /FAQ/ }).first().click();
await phone.waitForTimeout(2000);
console.log(`after tapping FAQ in the menu: menu ${await phone.locator("#site-drawer").evaluate((e) => (e.inert ? "closed" : "open"))}, scrolled to ${await phone.evaluate(() => Math.round(window.scrollY))}px`);
await phone.screenshot({ path: `${OUT}/phone-after-faq.png` });

await browser.close();
console.log(errors.length ? `console errors:\n  ${errors.join("\n  ")}` : "no console errors");
