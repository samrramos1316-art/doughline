// Shared env/client bootstrap for the one-off verification scripts under
// scripts/*.mjs. These are plain Node scripts (not part of the Next.js app),
// so they load .env.local themselves.
import { createClient } from "@supabase/supabase-js";

export function loadEnv() {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // Already loaded, or env vars provided another way (e.g. CI secrets).
  }
}

export function getEnv() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !anonKey || !serviceKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY / SUPABASE_SECRET_KEY in .env.local",
    );
  }
  return { url, anonKey, serviceKey };
}

// Service-role client: bypasses RLS entirely. Only for test setup/teardown
// (creating/deleting fixtures), never for the assertions themselves.
export function getAdminClient() {
  const { url, serviceKey } = getEnv();
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Anon client: this is what a real signed-in user's browser session looks
// like. Sign in with it to get an RLS-scoped client for assertions.
export function getAnonClient() {
  const { url, anonKey } = getEnv();
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function assert(cond, msg) {
  if (!cond) throw new Error("ASSERTION FAILED: " + msg);
  console.log("PASS:", msg);
}
