import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// Resolves the vision model's vendor_name_guess to a vendors row, creating it
// on first sight. Aliases are keyed per vendor (§3.5), so every scanned
// invoice needs a vendor_id for "this vendor's phrasing" to be remembered.
// Matching is on vendors.normalized_name (lower/trim) — "Sysco" and "SYSCO
// CENTRAL TEXAS" are still different vendors in v1.
export async function resolveVendorId(
  supabase: SupabaseClient<Database>,
  orgId: string,
  vendorNameGuess: string | null,
): Promise<string | null> {
  const name = vendorNameGuess?.trim();
  if (!name) return null;
  const normalized = name.toLowerCase();

  const existing = await supabase.from("vendors").select("id").eq("normalized_name", normalized).maybeSingle();
  if (existing.data) return existing.data.id;

  const inserted = await supabase.from("vendors").insert({ org_id: orgId, name }).select("id").single();
  if (inserted.data) return inserted.data.id;

  // Lost a race with a concurrent scan from the same vendor (unique
  // (org_id, normalized_name)): the row exists now.
  const retry = await supabase.from("vendors").select("id").eq("normalized_name", normalized).maybeSingle();
  if (retry.data) return retry.data.id;
  throw new Error("could not resolve vendor: " + (inserted.error?.message ?? "unknown error"));
}
