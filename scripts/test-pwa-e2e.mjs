// Step 12 (PWA) end to end, in headless Edge against a production build
// (`next start`: the service worker only registers in production).
//
//   1. Manifest: served, valid, icons are real PNGs of the stated sizes.
//   2. <head>: manifest link, iOS home-screen tags, tab and Apple icons.
//   3. Service worker: served uncached, registers, activates; Chrome reports
//      no installability errors.
//   4. Offline: a signed-in page with no connection shows DoughTally's
//      offline screen (styled, from cache), then the real page once back.
//   5. Nothing but the offline page is cached as a page (prices stay live).
//   6. Install card: appears when the browser offers install, Not now hides
//      it and it stays hidden on reload; iPhone Safari gets the Share steps.
//
// Run: npm run build, then node scripts/test-pwa-e2e.mjs [--base=https://…]
import fs from "node:fs";
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";
import { loadEnv, getAdminClient, assert } from "./lib/supabaseTestEnv.mjs";
import { waitForServer, killDevServer } from "./lib/devServer.mjs";

loadEnv();
const baseArg = process.argv.find((a) => a.startsWith("--base="))?.slice(7);
const PORT = 3109;
const BASE = baseArg ?? `http://localhost:${PORT}`;
const OUT = `test-output/pwa${baseArg ? "-prod" : ""}`;
const admin = getAdminClient();
const password = "Test-Password-123!";
const email = `pwa-${Date.now()}@example.com`;
let server, browser, userId;
const banner = (t) => console.log(`\n=== ${t} ===`);
const pngSize = (buf) => [buf.readUInt32BE(16), buf.readUInt32BE(20)];

async function logIn(page) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
}

// What Chrome fires before offering install. Headless never fires it on its
// own, so the test dispatches one shaped like the real event.
const offerInstall = (page) =>
  page.evaluate(() => {
    const e = new Event("beforeinstallprompt", { cancelable: true });
    window.__prompted = false;
    e.prompt = async () => { window.__prompted = true; };
    e.userChoice = Promise.resolve({ outcome: "dismissed" });
    window.dispatchEvent(e);
  });

try {
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of fs.readdirSync(OUT)) if (!f.startsWith("00-")) fs.rmSync(`${OUT}/${f}`);
  if (!baseArg) {
    server = spawn("npx", ["next", "start", "--port", String(PORT)], { shell: true, stdio: "ignore" });
    await waitForServer(BASE, 60_000);
  }

  banner("1. manifest");
  const mres = await fetch(`${BASE}/manifest.webmanifest`);
  const manifest = await mres.json();
  console.log(JSON.stringify({ name: manifest.name, start_url: manifest.start_url, display: manifest.display, theme_color: manifest.theme_color, background_color: manifest.background_color, shortcuts: manifest.shortcuts.map((s) => s.url) }));
  assert(mres.ok && manifest.name === "DoughTally" && manifest.start_url === "/dashboard" && manifest.display === "standalone", "manifest served: DoughTally, opens /dashboard full screen");
  for (const icon of manifest.icons) {
    const r = await fetch(`${BASE}${icon.src}`);
    const [w, h] = pngSize(Buffer.from(await r.arrayBuffer()));
    console.log(`${icon.src}  ${r.headers.get("content-type")}  ${w}x${h}  purpose=${icon.purpose}`);
    assert(r.ok && `${w}x${h}` === icon.sizes, `${icon.src} is a real ${icon.sizes} PNG`);
  }
  assert(manifest.icons.some((i) => i.purpose === "maskable"), "has a maskable icon for Android's shaped icons");

  banner("2. <head> tags");
  browser = await chromium.launch({ channel: "msedge", headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(BASE);
  const head = await page.evaluate(() => ({
    manifest: document.querySelector('link[rel="manifest"]')?.getAttribute("href"),
    apple: document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute("href"),
    icon: [...document.querySelectorAll('link[rel="icon"]')].map((l) => l.getAttribute("href")),
    theme: document.querySelector('meta[name="theme-color"]')?.getAttribute("content"),
    capable: document.querySelector('meta[name="mobile-web-app-capable"], meta[name="apple-mobile-web-app-capable"]')?.getAttribute("content"),
    title: document.querySelector('meta[name="apple-mobile-web-app-title"]')?.getAttribute("content"),
  }));
  console.log(JSON.stringify(head));
  assert(head.manifest === "/manifest.webmanifest" && head.apple?.startsWith("/apple-icon") && head.icon.some((h) => h.startsWith("/icon")) && head.theme === "#ffffff", "manifest, Apple icon, tab icon and theme colour linked");
  assert(head.capable === "yes" && head.title === "DoughTally", "iOS home-screen tags set");
  const apple = await fetch(`${BASE}${head.apple}`);
  assert(pngSize(Buffer.from(await apple.arrayBuffer())).join("x") === "180x180", "Apple icon is 180x180");

  banner("3. service worker");
  const swRes = await fetch(`${BASE}/sw.js`);
  console.log(`/sw.js  ${swRes.headers.get("content-type")}  cache-control: ${swRes.headers.get("cache-control")}`);
  assert(swRes.ok && /no-cache/.test(swRes.headers.get("cache-control")), "sw.js served and never cached by the browser");
  const sw = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    const w = reg.active;
    if (w.state !== "activated") await new Promise((r) => w.addEventListener("statechange", () => w.state === "activated" && r()));
    return { scope: reg.scope, state: w.state };
  });
  console.log(JSON.stringify(sw));
  assert(sw.state === "activated" && sw.scope === `${BASE}/`, "service worker registered and active for the whole site");
  // Playwright's contexts count as incognito, where nothing is installable;
  // ask a real (persistent) profile instead.
  const profileDir = fs.mkdtempSync(`${process.env.TEMP ?? "/tmp"}/doughtally-pwa-`);
  const profile = await chromium.launchPersistentContext(profileDir, { channel: "msedge", headless: true });
  const ppage = profile.pages()[0] ?? (await profile.newPage());
  await ppage.goto(BASE);
  await ppage.evaluate(() => navigator.serviceWorker.ready);
  const cdp = await profile.newCDPSession(ppage);
  const { errors: manifestErrors } = await cdp.send("Page.getAppManifest");
  const { installabilityErrors } = await cdp.send("Page.getInstallabilityErrors");
  await profile.close();
  fs.rmSync(profileDir, { recursive: true, force: true });
  console.log(`manifest errors: ${JSON.stringify(manifestErrors)}`);
  console.log(`installability errors: ${JSON.stringify(installabilityErrors)}`);
  assert(installabilityErrors.length === 0 && manifestErrors.length === 0, "browser considers DoughTally installable");

  banner("4. offline");
  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { business_name: "PWA Check Bakery" } });
  if (error) throw new Error(error.message);
  userId = created.user.id;
  await logIn(page);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await ctx.setOffline(true);
  await page.goto(`${BASE}/market`).catch(() => {});
  await page.getByRole("heading", { name: "You're offline" }).waitFor({ timeout: 10_000 });
  const look = await page.evaluate(() => ({ url: location.pathname, bg: getComputedStyle(document.querySelector("main")).backgroundColor, font: getComputedStyle(document.querySelector("h1")).fontFamily }));
  console.log(JSON.stringify(look));
  await page.screenshot({ path: `${OUT}/01-offline-phone.png` });
  assert(look.url === "/market" && /Instrument/i.test(look.font), "offline: /market shows the styled offline screen (from cache, no network)");
  await ctx.setOffline(false);
  await page.waitForURL(`${BASE}/market`);
  await page.getByRole("heading", { name: "You're offline" }).waitFor({ state: "detached", timeout: 20_000 });
  assert(!(await page.getByText("You're offline").count()), "back online: the page reloads itself into Market Watch");

  banner("5. what's cached");
  const cached = await page.evaluate(async () => {
    const out = [];
    for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) out.push(new URL(r.url).pathname);
    return out;
  });
  const pages = cached.filter((p) => !p.startsWith("/_next/static/") && !p.startsWith("/icons/"));
  console.log(`${cached.length} cached files; non-static: ${JSON.stringify(pages)}`);
  assert(pages.length === 1 && pages[0] === "/offline", "only the offline page is cached — dashboards, prices and API data never are");

  banner("6. install card");
  await page.goto(`${BASE}/dashboard`);
  await page.waitForLoadState("networkidle");
  assert(!(await page.getByRole("complementary", { name: "Install DoughTally" }).count()), "no card until the browser offers install");
  await offerInstall(page);
  const card = page.getByRole("complementary", { name: "Install DoughTally" });
  await card.waitFor();
  await page.screenshot({ path: `${OUT}/02-install-card-phone.png` });
  await card.getByRole("button", { name: "Install" }).click();
  assert(await page.evaluate(() => window.__prompted), "Install opens the browser's install dialog");
  await card.waitFor({ state: "detached" });
  await page.reload();
  await offerInstall(page);
  await page.waitForTimeout(500);
  assert(!(await card.count()), "declined → not shown again on the next visit");

  const desk = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await logIn(desk);
  await offerInstall(desk);
  await desk.getByRole("complementary", { name: "Install DoughTally" }).waitFor();
  await desk.screenshot({ path: `${OUT}/03-install-card-desktop.png` });

  const iphone = await (await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
  })).newPage();
  await logIn(iphone);
  const iosCard = iphone.getByRole("complementary", { name: "Install DoughTally" });
  await iosCard.waitFor();
  await iphone.screenshot({ path: `${OUT}/04-install-card-iphone.png` });
  const iosText = await iosCard.innerText();
  assert(/Add to Home Screen/.test(iosText) && !(await iosCard.getByRole("button", { name: "Install" }).count()), "iPhone Safari gets Share → Add to Home Screen steps");
  await iosCard.getByRole("button", { name: "Got it" }).click();
  await iphone.reload();
  await iphone.waitForLoadState("networkidle");
  assert(!(await iosCard.count()), "iPhone steps stay dismissed after Got it");

  console.log(`\nPWA end-to-end test passed. Screenshots in ${OUT}/`);
} finally {
  if (browser) await browser.close();
  killDevServer(server);
  if (userId) {
    const { data: p } = await admin.from("profiles").select("org_id").eq("id", userId).maybeSingle();
    if (p?.org_id) await admin.from("organizations").delete().eq("id", p.org_id);
    await admin.auth.admin.deleteUser(userId);
    console.log("test user deleted");
  }
}
