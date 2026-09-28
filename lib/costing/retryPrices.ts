import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { applyLinePrice, type PriceOutcome } from "./applyPrice";

// Invoice lines matched to these ingredients whose price never made it on
// (price_note says why — usually a unit that couldn't be converted). Called
// after an ingredient's base unit changes, so fixing the unit fixes the
// price without re-scanning. Oldest invoice first, so the newest price ends
// up current and older ones land in history (migration 019).
export async function retryUnappliedPrices(
  supabase: SupabaseClient<Database>,
  ingredientIds: string[],
): Promise<PriceOutcome[]> {
  if (!ingredientIds.length) return [];
  const { data: lines, error } = await supabase
    .from("invoice_line_items")
    .select("id, created_at, invoices(invoice_date)")
    .in("matched_ingredient_id", ingredientIds)
    .in("match_status", ["confirmed", "auto_matched"])
    .is("price_applied_at", null);
  if (error) throw new Error("loading unpriced lines failed: " + error.message);

  const ordered = (lines ?? []).sort((a, b) =>
    (a.invoices?.invoice_date ?? a.created_at).localeCompare(b.invoices?.invoice_date ?? b.created_at),
  );
  const outcomes: PriceOutcome[] = [];
  for (const line of ordered) outcomes.push(await applyLinePrice(supabase, line.id));
  return outcomes;
}
