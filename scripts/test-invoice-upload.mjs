// §13 step 5 verification: prove that a captured invoice photo actually lands
// in Supabase Storage and creates a real `invoices` row with status pending,
// through the real code paths (Storage RLS from 013_invoice_storage.sql, and
// the POST /api/invoices route handler) — not just a manual check.
//
// Also proves the org-scoping on both layers: a signed-in user cannot write
// into another org's Storage folder, and the route rejects a payload whose
// file_storage_path doesn't match the caller's own org.
//
// Requires the dev server NOT already running on port 3000 (this script
// starts and stops its own).
//
// Run: node scripts/test-invoice-upload.mjs
import crypto from "node:crypto";
import { loadEnv, getAdminClient, getAnonClient, assert } from "./lib/supabaseTestEnv.mjs";
import { startDevServer, waitForServer, killDevServer } from "./lib/devServer.mjs";

loadEnv();

const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;
const PROJECT_REF = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname.split(".")[0];
const AUTH_COOKIE_NAME = `sb-${PROJECT_REF}-auth-token`;

const admin = getAdminClient();
const suffix = Date.now();
const emailA = `invoice-upload-test-a-${suffix}@example.com`;
const emailB = `invoice-upload-test-b-${suffix}@example.com`;
const password = "Test-Password-123!";

let userAId, userBId, orgAId, orgBId, devServer;
const uploadedPaths = [];
let createdInvoiceId;

function buildAuthCookie(session) {
  const encoded = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${AUTH_COOKIE_NAME}=${encoded}`;
}

try {
  // 1. Two fresh test users (two orgs) via the Admin API.
  const { data: dataA, error: errA } = await admin.auth.admin.createUser({
    email: emailA,
    password,
    email_confirm: true,
    user_metadata: { business_name: "Invoice Upload Test A" },
  });
  if (errA) throw new Error("create user A failed: " + errA.message);
  userAId = dataA.user.id;

  const { data: dataB, error: errB } = await admin.auth.admin.createUser({
    email: emailB,
    password,
    email_confirm: true,
    user_metadata: { business_name: "Invoice Upload Test B" },
  });
  if (errB) throw new Error("create user B failed: " + errB.message);
  userBId = dataB.user.id;

  const { data: profileA } = await admin.from("profiles").select("org_id").eq("id", userAId).single();
  orgAId = profileA.org_id;
  const { data: profileB } = await admin.from("profiles").select("org_id").eq("id", userBId).single();
  orgBId = profileB.org_id;

  // 2. Sign in as user A the same way the browser client would.
  const anonA = getAnonClient();
  const { data: signInA, error: signInAErr } = await anonA.auth.signInWithPassword({
    email: emailA,
    password,
  });
  if (signInAErr) throw new Error("sign-in A failed: " + signInAErr.message);

  const invoiceId = crypto.randomUUID();
  const ownPath = `${orgAId}/${invoiceId}.jpg`;
  const fakeImageBytes = crypto.randomBytes(2048); // content doesn't matter for Storage — only that bytes round-trip

  // 3. Upload to the caller's own org folder — this is the real Storage
  //    write a browser would perform (§5.2 step 2), exercising the RLS
  //    policies from 013_invoice_storage.sql.
  const { error: uploadErr } = await anonA.storage
    .from("invoices")
    .upload(ownPath, fakeImageBytes, { contentType: "image/jpeg" });
  if (uploadErr) throw new Error("upload to own org folder failed: " + uploadErr.message);
  uploadedPaths.push(ownPath);

  const { data: downloaded, error: downloadErr } = await anonA.storage.from("invoices").download(ownPath);
  if (downloadErr) throw new Error("download of uploaded file failed: " + downloadErr.message);
  const downloadedBytes = Buffer.from(await downloaded.arrayBuffer());
  console.log("Query result — downloaded object byte length:", downloadedBytes.length, "vs uploaded:", fakeImageBytes.length);
  assert(downloadedBytes.equals(fakeImageBytes), "the file downloaded from Storage matches the bytes that were uploaded");

  // 4. Cross-org write must be rejected by Storage RLS.
  const foreignPath = `${orgBId}/${crypto.randomUUID()}.jpg`;
  const { error: crossOrgErr } = await anonA.storage
    .from("invoices")
    .upload(foreignPath, fakeImageBytes, { contentType: "image/jpeg" });
  assert(!!crossOrgErr, "uploading into another org's Storage folder is rejected by RLS");

  // 5. Start the real dev server and call the real POST /api/invoices route
  //    with a reconstructed SSR session cookie, exactly as the browser flow
  //    (ScanInvoiceClient -> fetch('/api/invoices')) does after the Storage
  //    upload above.
  devServer = startDevServer(PORT);
  await waitForServer(BASE_URL, 60_000);

  const cookie = buildAuthCookie(signInA.session);

  const createRes = await fetch(`${BASE_URL}/api/invoices`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ id: invoiceId, file_storage_path: ownPath, file_type: "image" }),
  });
  const createBody = await createRes.json();
  console.log("Query result — POST /api/invoices response:", createRes.status, JSON.stringify(createBody));
  assert(createRes.status === 201, "POST /api/invoices returns 201 for a valid upload");
  assert(createBody.invoice_id === invoiceId, "the created invoice's id matches the client-generated id");
  createdInvoiceId = createBody.invoice_id;

  // 6. Confirm the row actually landed in the database with status pending.
  const { data: invoiceRow, error: invoiceRowErr } = await admin
    .from("invoices")
    .select("id, org_id, status, file_storage_path, file_type, source_type")
    .eq("id", invoiceId)
    .single();
  if (invoiceRowErr) throw new Error("invoice row missing after create: " + invoiceRowErr.message);
  console.log("Query result — invoices row:", JSON.stringify(invoiceRow));
  assert(invoiceRow.status === "pending", "the new invoice row has status 'pending'");
  assert(invoiceRow.org_id === orgAId, "the invoice row belongs to the uploading user's org");
  assert(invoiceRow.file_storage_path === ownPath, "the invoice row's file_storage_path matches what was uploaded");

  // 7. The route's own org-match guard rejects a path from another org, even
  //    though a real client could never construct this via Storage RLS.
  const mismatchRes = await fetch(`${BASE_URL}/api/invoices`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ id: crypto.randomUUID(), file_storage_path: foreignPath, file_type: "image" }),
  });
  console.log("Query result — POST /api/invoices with foreign-org path:", mismatchRes.status);
  assert(mismatchRes.status === 400, "the route rejects a file_storage_path that doesn't match the caller's org");

  console.log("\nAll invoice upload checks passed.");
} finally {
  console.log("\nCleaning up test fixtures...");
  killDevServer(devServer);
  if (createdInvoiceId) await admin.from("invoices").delete().eq("id", createdInvoiceId);
  for (const path of uploadedPaths) await admin.storage.from("invoices").remove([path]);
  if (orgAId) await admin.from("organizations").delete().eq("id", orgAId);
  if (orgBId) await admin.from("organizations").delete().eq("id", orgBId);
  if (userAId) await admin.auth.admin.deleteUser(userAId);
  if (userBId) await admin.auth.admin.deleteUser(userBId);
  console.log("Cleanup done.");
}
