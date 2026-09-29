// Auth flows + the marketing pages, in headless Edge against real Supabase.
// No email is sent: confirmation links are minted with the admin API
// (generateLink), which returns the token without mailing it.
//
//   1. Landing page (logged out) — desktop + phone screenshots.
//   2. Login form in an OS dark-mode browser: typed text and password dots
//      are dark on white (the bug: they inherited near-white).
//   3. Confirmed user logs in → /dashboard.
//   4. Wrong password → a readable error.
//   5. Unconfirmed user → "not confirmed" + a resend button (not clicked).
//   6. A signup confirmation link → /auth/confirm → signed in on /dashboard.
//   7. A broken link → /login with the reason shown.
//   8. Check-email page; landing page when signed in.
//
// Run: node scripts/test-auth-e2e.mjs [--base=https://…]  (default: local dev server)
import fs from "node:fs";
import { chromium } from "playwright-core";
import { loadEnv, getAdminClient, assert } from "./lib/supabaseTestEnv.mjs";
import { startDevServer, waitForServer, killDevServer } from "./lib/devServer.mjs";

loadEnv();
const baseArg = process.argv.find((a) => a.startsWith("--base="))?.slice(7);
const PORT = 3108;
const BASE = baseArg ?? `http://localhost:${PORT}`;
const OUT = `test-output/auth${baseArg ? "-prod" : ""}`;
const admin = getAdminClient();
const stamp = Date.now();
const password = "Test-Password-123!";
const userIds = [];
let devServer, browser;

async function makeUser(email, confirmed) {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: confirmed, user_metadata: { business_name: "Auth Check Bakery" } });
  if (error) throw new Error(error.message);
  userIds.push(data.user.id);
  return data.user;
}
const banner = (t) => console.log(`\n=== ${t} ===`);

try {
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of fs.readdirSync(OUT)) fs.rmSync(`${OUT}/${f}`);
  if (!baseArg) {
    devServer = startDevServer(PORT);
    await waitForServer(BASE, 120_000);
  }
  browser = await chromium.launch({ channel: "msedge", headless: true });

  banner("1. landing page, logged out");
  const desk = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  await desk.goto(BASE);
  await desk.getByRole("heading", { level: 1 }).waitFor();
  console.log(`h1: "${await desk.getByRole("heading", { level: 1 }).innerText()}"`);
  await desk.screenshot({ path: `${OUT}/01-landing-desktop.png`, fullPage: true });
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await phone.goto(BASE);
  await phone.screenshot({ path: `${OUT}/02-landing-phone.png`, fullPage: true });
  const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert(await desk.getByRole("link", { name: "Get started" }).isVisible(), "logged-out nav offers Get started");
  const loginTab = desk.getByRole("banner").getByRole("link", { name: "Log in" });
  assert((await loginTab.getAttribute("href")) === "/login", "nav has a Log in tab that launches the app's login");
  assert(overflow <= 0, `no sideways scroll on a phone (overflow ${overflow}px)`);

  banner("2. login form with the browser in dark mode");
  const darkCtx = await browser.newContext({ colorScheme: "dark", viewport: { width: 1280, height: 860 } });
  const dark = await darkCtx.newPage();
  await dark.goto(`${BASE}/login`);
  await dark.getByLabel("Email").fill("someone@example.com");
  await dark.getByLabel("Password", { exact: true }).fill("hunter2hunter2");
  const colors = await dark.evaluate(() => {
    const el = document.getElementById("password");
    const cs = getComputedStyle(el);
    // Tailwind v4 emits lab()/oklch() colors; paint each on a canvas to read it back as sRGB.
    const toRgb = (color) => {
      const ctx = Object.assign(document.createElement("canvas"), { width: 1, height: 1 }).getContext("2d");
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      return `rgb(${r}, ${g}, ${b})`;
    };
    return { text: toRgb(cs.color), background: toRgb(cs.backgroundColor), prefersDark: matchMedia("(prefers-color-scheme: dark)").matches };
  });
  console.log(`prefers-color-scheme: dark = ${colors.prefersDark}; password field text ${colors.text} on ${colors.background}`);
  await dark.screenshot({ path: `${OUT}/03-login-dark-mode.png` });
  const lum = (rgb) => {
    const [r, g, b] = rgb.match(/\d+/g).map(Number).map((v) => v / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (lum(colors.background) + 0.05) / (lum(colors.text) + 0.05);
  assert(colors.prefersDark && ratio > 12, `typed password is readable in dark mode (contrast ${ratio.toFixed(1)}:1)`);
  await dark.getByRole("button", { name: "Show password" }).click();
  assert((await dark.getByLabel("Password", { exact: true }).getAttribute("type")) === "text", "Show reveals the password");

  banner("3. confirmed user logs in");
  const ok = await makeUser(`auth-ok-${stamp}@example.com`, true);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.getByLabel("Email").fill(ok.email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
  assert(page.url().endsWith("/dashboard"), `logged in → ${page.url().replace(BASE, "")}`);

  banner("4. wrong password");
  const p4 = await (await browser.newContext()).newPage();
  await p4.goto(`${BASE}/login`);
  await p4.getByLabel("Email").fill(ok.email);
  await p4.getByLabel("Password", { exact: true }).fill("wrong-password-1");
  await p4.getByRole("button", { name: "Log in" }).click();
  const err4 = await p4.locator("p[role=alert]").innerText();
  console.log(`shown: "${err4}"`);
  assert(/don't match/.test(err4), "readable wrong-password message");

  banner("5. unconfirmed user");
  const pending = await makeUser(`auth-pending-${stamp}@example.com`, false);
  const p5 = await (await browser.newContext({ viewport: { width: 1280, height: 860 } })).newPage();
  await p5.goto(`${BASE}/login`);
  await p5.getByLabel("Email").fill(pending.email);
  await p5.getByLabel("Password", { exact: true }).fill(password);
  await p5.getByRole("button", { name: "Log in" }).click();
  const err5 = await p5.locator("p[role=alert]").innerText();
  console.log(`shown: "${err5}"`);
  await p5.screenshot({ path: `${OUT}/04-login-unconfirmed.png` });
  assert(/hasn't been confirmed/.test(err5) && (await p5.getByRole("button", { name: /Send a new confirmation email/ }).isVisible()),
    "unconfirmed account told why + offered a resend");
  assert(p5.url().endsWith("/login"), "stays on /login rather than bouncing silently");

  banner("6. confirmation link → /auth/confirm → dashboard");
  const newEmail = `auth-link-${stamp}@example.com`;
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "signup", email: newEmail, password, options: { data: { business_name: "Link Check Bakery" } } });
  if (linkErr) throw new Error(linkErr.message);
  userIds.push(link.user.id);
  console.log(`generated (not emailed) signup link for ${newEmail}; confirmed before click: ${!!link.user.email_confirmed_at}`);
  const p6 = await (await browser.newContext()).newPage();
  await p6.goto(`${BASE}/auth/confirm?token_hash=${link.properties.hashed_token}&type=signup`);
  await p6.waitForURL(/\/onboarding\/import/, { timeout: 30_000 });
  const { data: after } = await admin.auth.admin.getUserById(link.user.id);
  assert(/\/onboarding\/import\?welcome=1$/.test(p6.url()) && !!after.user.email_confirmed_at, `link confirmed the email and signed in → ${p6.url().replace(BASE, "")} (the first-run import)`);

  banner("7. broken link");
  const p7 = await (await browser.newContext()).newPage();
  await p7.goto(`${BASE}/auth/confirm?code=not-a-real-code`);
  await p7.waitForURL(/\/login/);
  const err7 = await p7.locator("p[role=alert]").innerText();
  console.log(`shown: "${err7}"`);
  assert(/Log in/.test(err7) && !/PKCE|verifier/i.test(err7), "broken link lands on /login with a plain-English reason");

  banner("8. check-email page, and landing page when signed in");
  const p8 = await (await browser.newContext({ viewport: { width: 1280, height: 860 } })).newPage();
  await p8.goto(`${BASE}/signup/check-email?email=${encodeURIComponent("you@yourbakery.com")}`);
  await p8.screenshot({ path: `${OUT}/05-check-email.png` });
  assert(/you@yourbakery\.com/.test(await p8.locator("main").innerText()), "check-email page names the address");
  await p8.goto(`${BASE}/signup`);
  await p8.screenshot({ path: `${OUT}/06-signup.png`, fullPage: true });

  banner("9. signing up needs the terms box ticked");
  const blockedEmail = `auth-noterms-${stamp}@example.com`;
  await p8.getByLabel("Business name").fill("No Terms Bakery");
  await p8.getByLabel("Email").fill(blockedEmail);
  await p8.getByLabel("Password", { exact: true }).fill(password);
  const box = p8.locator("#acceptTerms");
  assert((await box.isVisible()) && !(await box.isChecked()) && (await box.getAttribute("required")) !== null, "signup shows an unticked, required terms checkbox");
  const legalLinks = await p8.locator("form").getByRole("link").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  assert(legalLinks.includes("/terms") && legalLinks.includes("/privacy"), "the checkbox links to the Terms and the Privacy Policy");
  await p8.getByRole("button", { name: "Create account" }).click();
  await p8.waitForTimeout(1500);
  assert(p8.url().endsWith("/signup") && !(await box.evaluate((el) => el.validity.valid)), "the browser won't submit without it");
  // Past the browser check: the server must refuse too.
  await box.evaluate((el) => el.removeAttribute("required"));
  await p8.getByRole("button", { name: "Create account" }).click();
  const err9 = await p8.locator("p[role=alert]").innerText({ timeout: 30_000 });
  const { data: all } = await admin.auth.admin.listUsers({ perPage: 1000 });
  assert(/agree to the Terms/.test(err9) && !all.users.some((u) => u.email === blockedEmail), `the server refuses too, and no account is made ("${err9}")`);
  for (const path of ["/privacy", "/terms"]) {
    await p8.goto(`${BASE}${path}`);
    const h = await p8.getByRole("heading", { level: 1 }).innerText();
    assert(/Privacy Policy|Terms of Service/.test(h), `${path} is public: "${h}"`);
  }
  await p8.screenshot({ path: `${OUT}/07-terms.png`, fullPage: false });
  await page.goto(BASE);
  const openApp = page.getByRole("banner").getByRole("link", { name: "Open app" });
  assert((await openApp.isVisible()) && (await openApp.getAttribute("href")) === "/dashboard", "signed-in visitors get an Open app tab straight into /dashboard");

  console.log(`\nAuth end-to-end test passed. Screenshots in ${OUT}/`);
} finally {
  if (browser) await browser.close();
  killDevServer(devServer);
  for (const id of userIds) {
    const { data: p } = await admin.from("profiles").select("org_id").eq("id", id).maybeSingle();
    if (p?.org_id) await admin.from("organizations").delete().eq("id", p.org_id);
    await admin.auth.admin.deleteUser(id);
  }
  console.log(`${userIds.length} test users deleted`);
}
