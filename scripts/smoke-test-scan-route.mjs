// Not a correctness test (there's no real vision provider yet — see the TODOs
// in lib/ai/vision/{gemini,claude}.ts) — this just proves the §5.2 step 4
// plumbing that IS real doesn't crash: the route fetches the file from
// Storage, calls the (stubbed) provider, and persists the documented status
// transition. Because the stub always returns zero line items, the expected
// outcome here is status: 'failed' with raw_extraction populated — that's
// the correct behavior for "the provider found nothing," not a bug.
//
// Run: node scripts/smoke-test-scan-route.mjs
import crypto from "node:crypto";
import { loadEnv, getAdminClient, getAnonClient, assert } from "./lib/supabaseTestEnv.mjs";
import { startDevServer, waitForServer, killDevServer } from "./lib/devServer.mjs";

loadEnv();

const PORT = 3101;
const BASE_URL = `http://localhost:${PORT}`;
const PROJECT_REF = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname.split(".")[0];
const AUTH_COOKIE_NAME = `sb-${PROJECT_REF}-auth-token`;

const admin = getAdminClient();
const suffix = Date.now();
const email = `scan-route-smoke-${suffix}@example.com`;
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
    user_metadata: { business_name: "Scan Route Smoke Test" },
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
  const fakeImageBytes = crypto.randomBytes(2048);

  const { error: uploadErr } = await anon.storage
    .from("invoices")
    .upload(uploadedPath, fakeImageBytes, { contentType: "image/jpeg" });
  if (uploadErr) throw new Error("upload failed: " + uploadErr.message);

  devServer = startDevServer(PORT);
  await waitForServer(BASE_URL, 60_000);

  const cookie = buildAuthCookie(signIn.session);

  const createRes = await fetch(`${BASE_URL}/api/invoices`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ id: invoiceId, file_storage_path: uploadedPath, file_type: "image" }),
  });
  assert(createRes.status === 201, "POST /api/invoices creates the row");

  const scanRes = await fetch(`${BASE_URL}/api/invoices/${invoiceId}/scan`, {
    method: "POST",
    headers: { Cookie: cookie },
  });
  const scanBody = await scanRes.json();
  console.log("Query result — POST /api/invoices/[id]/scan response:", scanRes.status, JSON.stringify(scanBody));
  assert(scanRes.status === 200, "the scan route runs end-to-end without crashing (fetch Storage -> call stub provider -> persist)");
  assert(scanBody.status === "failed", "with the stub provider returning zero line items, status correctly lands on 'failed'");

  const { data: invoiceRow, error: invoiceRowErr } = await admin
    .from("invoices")
    .select("status, raw_extraction, error_message")
    .eq("id", invoiceId)
    .single();
  if (invoiceRowErr) throw new Error("invoice row missing: " + invoiceRowErr.message);
  console.log("Query result — invoices row after scan:", JSON.stringify(invoiceRow));
  assert(invoiceRow.status === "failed", "the persisted row also shows status 'failed'");
  assert(invoiceRow.raw_extraction !== null, "raw_extraction was persisted from the (stub) provider result");
  assert(invoiceRow.error_message === "No line items extracted", "error_message explains why it failed");

  console.log("\nScan route smoke test passed (stub extraction, real plumbing).");
} finally {
  console.log("\nCleaning up test fixtures...");
  killDevServer(devServer);
  if (invoiceId) await admin.from("invoices").delete().eq("id", invoiceId);
  if (uploadedPath) await admin.storage.from("invoices").remove([uploadedPath]);
  if (orgId) await admin.from("organizations").delete().eq("id", orgId);
  if (userId) await admin.auth.admin.deleteUser(userId);
  console.log("Cleanup done.");
}
