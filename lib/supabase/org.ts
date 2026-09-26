import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// Route handlers need org_id to insert with (RLS's with_check requires it
// match the caller's own org), so this reads it the same way current_org_id()
// does in SQL — via the caller's own profile row, respecting RLS.
export async function getCurrentOrgId(
  supabase: SupabaseClient<Database>,
): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single();

  if (error || !data) return null;
  return data.org_id;
}
