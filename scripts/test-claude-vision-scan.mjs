// End-to-end test of the real Claude vision provider (VISION_PROVIDER=claude,
// CLAUDE_API_KEY in .env.local): a signed-in user uploads a photographed
// invoice to Storage, creates the invoice row, and hits the real scan route,
// which calls Claude with structured outputs. Prints the extracted JSON and
// checks it against the known contents of the fixture.
//
// Fixture: scripts/fixtures/invoice-bluebonnet-bakery.jpg (rendered from the .html
// beside it — a skewed, shadowed phone-photo-style distributor invoice with 8 item
// lines plus subtotal / fuel-surcharge / total rows that must be skipped).
//
// Makes one real, billed Claude API call. Run: node scripts/test-claude-vision-scan.mjs
//
// KEEP_FIXTURES=1 leaves the test user/org/invoice/line items in Supabase so
// they can be inspected afterwards (e.g. with scripts/query-invoice-scan.mjs);
// the script prints the ids and delete instructions.
import crypto from "node:crypto";
import fs from "node:fs";
import { loadEnv, getAdminClient, getAnonClient, assert } from "./lib/supabaseTestEnv.mjs";
import { startDevServer, waitForServer, killDevServer } from "./lib/devServer.mjs";

loadEnv();

if (process.env.VISION_PROVIDER !== "claude") throw new Error("Set VISION_PROVIDER=claude in .env.local");
if (!process.env.CLAUDE_API_KEY) throw new Error("Set CLAUDE_API_KEY in .env.local");

const PORT = 3102;
const BASE_URL = `http://localhost:${PORT}`;
const PROJECT_REF = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname.split(".")[0];
const AUTH_COOKIE_NAME = `sb-${PROJECT_REF}-auth-token`;
const FIXTURE = "scripts/fixtures/invoice-bluebonnet-bakery.jpg";

// What's printed on the fixture — the ground truth to check against.
const EXPECTED_LINES = [
  { raw_text: "AP FLOUR BLCHD 50# BG", quantity: 3, unit_cost: 21.48, line_total: 64.44 },
  { raw_text: "SUGAR GRAN XFINE 50#", quantity: 2, unit_cost: 38.9, line_total: 77.8 },
  { raw_text: "BUTTER SWT UNSLTD 36/1#", quantity: 1, unit_cost: 142.56, line_total: 142.56 },
  { raw_text: "EGG LG GR AA LSE 15DZ", quantity: 2, unit_cost: 48.75, line_total: 97.5 },
  { raw_text: "CHOC CHIP SEMI SWT 1M 25#", quantity: 1, unit_cost: 89.2, line_total: 89.2 },
  { raw_text: "VANILLA XTRCT PURE 32OZ", quantity: 1, unit_cost: 54.1, line_total: 54.1 },
  { raw_text: "MILK WHL GAL 4/1", quantity: 1, unit_cost: 19.36, line_total: 19.36 },
  { raw_text: "CRM HVY 40% 12/QT", quantity: 1, unit_cost: 61.44, line_total: 61.44 },
];

const admin = getAdminClient();
const suffix = Date.now();
const email = `claude-scan-test-${suffix}@example.com`;
const password = "Test-Password-123!";

let userId, orgId, devServer, uploadedPath, invoiceId;

function buildAuthCookie(session) {
  const encoded = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${AUTH_COOKIE_NAME}=${encoded}`;
}

try {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { business_name: "Claude Scan Test Bakery" },
  });
  if (error) throw new Error("create user failed: " + error.message);
  userId = data.user.id;

  const { data: profile } = await admin.from("profiles").select("org_id").eq("id", userId).single();
  orgId = profile.org_id;

  const anon = getAnonClient();
  const { data: signIn, error: signInErr } = await anon.auth.signInWithPassword({ email, password });
  if (signInErr) throw new Error("sign-in failed: " + signInErr.message);

  invoiceId = crypto.randomUUID();
  uploadedPath = `${orgId}/${invoiceId}.jpg`;
  const { error: uploadErr } = await anon.storage
    .from("invoices")
    .upload(uploadedPath, fs.readFileSync(FIXTURE), { contentType: "image/jpeg" });
  if (uploadErr) throw new Error("upload failed: " + uploadErr.message);

  // Capture Claude's verbatim response text, logged server-side by the
  // provider when VISION_DEBUG_RAW=1 (inherited by the dev server's env).
  process.env.VISION_DEBUG_RAW = "1";
  devServer = startDevServer(PORT, { pipeOutput: true });
  let serverLog = "";
  devServer.stdout.on("data", (chunk) => { serverLog += chunk; });
  devServer.stderr.on("data", (chunk) => { serverLog += chunk; });
  await waitForServer(BASE_URL, 90_000);
  const cookie = buildAuthCookie(signIn.session);

  const createRes = await fetch(`${BASE_URL}/api/invoices`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ id: invoiceId, file_storage_path: uploadedPath, file_type: "image" }),
  });
  assert(createRes.status === 201, "POST /api/invoices creates the row");

  console.log("\nScanning with Claude (real API call)...");
  const started = Date.now();
  const scanRes = await fetch(`${BASE_URL}/api/invoices/${invoiceId}/scan`, {
    method: "POST",
    headers: { Cookie: cookie },
  });
  const scanBody = await scanRes.json();
  console.log(`Scan took ${((Date.now() - started) / 1000).toFixed(1)}s, HTTP ${scanRes.status}`);

  await new Promise((r) => setTimeout(r, 500)); // let the server's stdout flush
  const rawLine = serverLog.split(/\r?\n/).find((l) => l.includes("[vision-raw]"));
  console.log("\n=== Claude's raw response text (verbatim, before parsing) ===");
  console.log(rawLine ? rawLine.slice(rawLine.indexOf("[vision-raw]")) : "(not captured — no [vision-raw] line in server output)");
  console.log("\n=== Extracted JSON (scan route response .extraction) ===");
  console.log(JSON.stringify(scanBody.extraction ?? scanBody, null, 2));
  console.log("=======================================================\n");

  assert(scanRes.status === 200, "scan route returns 200");
  assert(scanBody.status === "processing", "invoice moves to 'processing' with line items extracted");

  const ex = scanBody.extraction;
  assert(/bluebonnet/i.test(ex.vendor_name_guess ?? ""), `vendor_name_guess mentions Bluebonnet (${ex.vendor_name_guess})`);
  assert(ex.invoice_date_guess === "2026-09-22", `invoice_date_guess is ISO 2026-09-22 (${ex.invoice_date_guess})`);
  assert(ex.invoice_number_guess === "7719-204583", `invoice_number_guess is 7719-204583 (${ex.invoice_number_guess})`);
  assert(ex.line_items.length === EXPECTED_LINES.length,
    `exactly ${EXPECTED_LINES.length} item lines — subtotal/fuel surcharge/total skipped (got ${ex.line_items.length})`);

  let mismatches = 0;
  for (const expected of EXPECTED_LINES) {
    const got = ex.line_items.find((li) => li.raw_text.replace(/\s+/g, " ").trim() === expected.raw_text);
    const ok = got && got.quantity === expected.quantity && got.unit_cost === expected.unit_cost && got.line_total === expected.line_total;
    if (!ok) {
      mismatches++;
      console.log(`MISMATCH: expected ${JSON.stringify(expected)}, got ${JSON.stringify(got ?? null)}`);
    }
  }
  assert(mismatches === 0, "every line's raw_text (verbatim), quantity, unit_cost and line_total match the printed invoice");

  const { data: invoiceRow } = await admin
    .from("invoices").select("status, invoice_number, invoice_date, raw_extraction").eq("id", invoiceId).single();
  assert(invoiceRow.status === "processing" && invoiceRow.raw_extraction !== null, "invoice row persisted with raw_extraction");
  assert(invoiceRow.invoice_number === "7719-204583", "invoice_number persisted on the row");

  const { data: lineRows } = await admin
    .from("invoice_line_items").select("raw_text, parsed_quantity, parsed_unit_cost").eq("invoice_id", invoiceId);
  assert(lineRows.length === EXPECTED_LINES.length, `${EXPECTED_LINES.length} invoice_line_items rows inserted`);

  console.log("\nClaude vision end-to-end scan passed.");
} finally {
  killDevServer(devServer);
  if (process.env.KEEP_FIXTURES === "1") {
    console.log(`\nKEEP_FIXTURES=1 — left in Supabase:\n  invoice_id = ${invoiceId}\n  org_id     = ${orgId}\n  user_id    = ${userId} (${email})`);
    console.log(`Inspect: node scripts/query-invoice-scan.mjs ${invoiceId}`);
    process.exit(0);
  }
  console.log("\nCleaning up test fixtures...");
  if (invoiceId) await admin.from("invoice_line_items").delete().eq("invoice_id", invoiceId);
  if (invoiceId) await admin.from("invoices").delete().eq("id", invoiceId);
  if (uploadedPath) await admin.storage.from("invoices").remove([uploadedPath]);
  if (orgId) await admin.from("organizations").delete().eq("id", orgId);
  if (userId) await admin.auth.admin.deleteUser(userId);
  console.log("Cleanup done.");
}
