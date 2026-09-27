import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { ReviewLineItem } from "@/components/swipe/SwipeDeck";
import { UNRESOLVED_STATUSES, parseCandidates } from "./review";

// The swipe-to-verify queue: unresolved line items, oldest first, for one
// invoice or (invoiceId omitted) the whole org — plus the ingredient list
// for the "match it to something else" picker.
export async function loadReviewQueue(supabase: SupabaseClient<Database>, invoiceId?: string) {
  let query = supabase
    .from("invoice_line_items")
    .select(
      "id, raw_text, parsed_item_name, parsed_quantity, parsed_unit, parsed_unit_cost, match_status, candidate_matches, invoices(invoice_number, vendors(name))",
    )
    .in("match_status", [...UNRESOLVED_STATUSES])
    .order("created_at", { ascending: true });
  if (invoiceId) query = query.eq("invoice_id", invoiceId);

  const [{ data: rows, error }, { data: ingredients, error: ingErr }] = await Promise.all([
    query,
    supabase.from("ingredients").select("id, name").order("name"),
  ]);
  if (error) throw new Error("loading review queue failed: " + error.message);
  if (ingErr) throw new Error("loading ingredients failed: " + ingErr.message);

  const lineItems: ReviewLineItem[] = (rows ?? []).map((r) => ({
    id: r.id,
    raw_text: r.raw_text,
    item_name: r.parsed_item_name,
    parsed_quantity: r.parsed_quantity,
    parsed_unit: r.parsed_unit,
    parsed_unit_cost: r.parsed_unit_cost,
    match_status: r.match_status,
    candidate_matches: parseCandidates(r.candidate_matches),
    context: invoiceId
      ? undefined
      : [r.invoices?.vendors?.name ?? "Unknown vendor", r.invoices?.invoice_number].filter(Boolean).join(" · "),
  }));

  return { lineItems, ingredients: ingredients ?? [] };
}
