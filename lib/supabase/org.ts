import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// Route handlers need org_id to insert with (RLS's with_check requires it
// match the caller's own org), so this reads it the same way current_org_id()
// does in SQL — via the caller's own profile row, respecting RLS.
//
// The user comes from the verified session token (getClaims, no network
// call). cache() dedupes per request: createClient() is cached too, so the
// layout and the page pass the same client and share one profile lookup.
export const getCurrentOrgId = cache(async (supabase: SupabaseClient<Database>): Promise<string | null> => {
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", userId)
    .single();

  if (error || !data) return null;
  return data.org_id;
});
