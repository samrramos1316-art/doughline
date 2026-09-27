import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// Service-role client: bypasses RLS entirely. Its only legitimate caller is
// the commodity-price ingestion job (§7) — commodity_price_series is shared,
// non-tenant data with no user insert policy. `server-only` makes importing
// this from a Client Component a build error, so the key can't reach a
// browser bundle.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("SUPABASE_SECRET_KEY is not set");
  return createClient<Database>(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
