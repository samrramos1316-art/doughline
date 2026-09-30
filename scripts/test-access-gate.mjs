// The pre-launch gate (lib/access.ts), against a server started with
//   DOUGHTALLY_ACCESS=closed DOUGHTALLY_ALLOWED_EMAILS=gate-allowed@example.com
// Checks: signup shows "not open yet"; a login not on the list is refused;
// the allowed login works; and someone signed in who isn't on the list is
// signed out with the reason.
//
// Run: node scripts/test-access-gate.mjs [--base=http://localhost:3000]
import { chromium } from "playwright-core";
import { loadEnv, getAdminClient } from "./lib/supabaseTestEnv.mjs";

loadEnv();
const BASE = process.argv.find((a) => a.startsWith("--base="))?.slice(7) ?? "http://localhost:3000";
const admin = getAdminClient();
const password = "Gate-Check-2026!";
const ids = [];
const results = [];
const check = (ok, msg, detail) => {
  results.push({ ok: !!ok, msg });
  console.log(`${ok ? "PASS" : "FAIL"}: ${msg}${!ok && detail ? `\n      ${detail}` : ""}`);
};
async function makeUser(email) {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { business_name: "Gate Check Bakery" } });
  if (error) throw new Error(error.message);
  ids.push(data.user.id);
  return data.user;
}
async function logIn(page, email) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
}

const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  await makeUser("gate-allowed@example.com");
  await makeUser(`gate-blocked-${Date.now()}@example.com`);
  const blocked = (await admin.auth.admin.getUserById(ids[1])).data.user.email;

  const page = await (await browser.newContext()).newPage();
  await page.goto(`${BASE}/signup`);
  const notice = await page.getByTestId("closed-notice").innerText().catch(() => "");
  check(/isn't open yet/.test(notice) && (await page.locator("#acceptTerms").count()) === 0, "signup shows \"not open yet\" instead of the form", notice);

  await logIn(page, blocked);
  const err = await page.locator("p[role=alert]").innerText({ timeout: 30_000 }).catch(() => "");
  check(/isn't open yet/.test(err) && page.url().endsWith("/login"), `a login not on the list is refused: "${err}"`);

  const ok = await (await browser.newContext()).newPage();
  await logIn(ok, "gate-allowed@example.com");
  await ok.waitForURL(/\/(dashboard|onboarding)/, { timeout: 60_000 }).catch(() => {});
  check(/\/(dashboard|onboarding)/.test(ok.url()), `the allowed email gets in (${ok.url().replace(BASE, "")})`);

  // Already signed in but not on the list: sign in behind the gate's back
  // (as a session from before the gate would be), then open the app.
  const stale = await browser.newContext();
  const sp = await stale.newPage();
  await sp.goto(`${BASE}/login`);
  const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email: blocked });
  // The link signs them in and heads for the app — where the gate meets them.
  await sp.goto(`${BASE}/auth/confirm?token_hash=${link.properties.hashed_token}&type=magiclink`);
  await sp.waitForURL(/\/login/, { timeout: 30_000 }).catch(() => {});
  const kicked = await sp.locator("p[role=alert]").innerText().catch(() => "");
  check(sp.url().includes("/login") && /isn't open yet/.test(kicked), "someone signed in but not on the list is sent to /login with the reason", `${sp.url()} ${kicked}`);
  const session = (await stale.cookies()).filter((c) => /^sb-.*-auth-token/.test(c.name) && c.value);
  check(session.length === 0, `…and their session is gone (${session.length} auth cookies left)`);
} catch (err) {
  check(false, "run stopped early", err.stack?.split("\n").slice(0, 3).join(" | "));
} finally {
  await browser.close();
  for (const id of ids) {
    const { data: p } = await admin.from("profiles").select("org_id").eq("id", id).maybeSingle();
    if (p?.org_id) await admin.from("organizations").delete().eq("id", p.org_id);
    await admin.auth.admin.deleteUser(id);
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed. Test users deleted.`);
  process.exit(failed.length ? 1 : 0);
}
