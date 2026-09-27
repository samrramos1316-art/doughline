import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { normalizeRawText } from "./normalize";
import { applyLinePrice } from "@/lib/costing/applyPrice";
import type { CandidateMatch } from "./vectorMatch";

type Client = SupabaseClient<Database>;

// A line item in any of these still needs a human (§6.3).
export const UNRESOLVED_STATUSES = ["pending", "needs_review", "new_ingredient"] as const;

export function parseCandidates(value: unknown): CandidateMatch[] {
  return Array.isArray(value) ? (value as CandidateMatch[]) : [];
}

// §5.2 step 6: an invoice is 'needs_review' while any line is unresolved and
// 'completed' once none are. The invoices_review_gate trigger (migration 015)
// independently refuses 'completed' with unresolved lines.
export async function refreshInvoiceStatus(supabase: Client, invoiceId: string) {
  const { count, error } = await supabase
    .from("invoice_line_items")
    .select("id", { count: "exact", head: true })
    .eq("invoice_id", invoiceId)
    .in("match_status", [...UNRESOLVED_STATUSES]);
  if (error) throw new Error("counting unresolved line items failed: " + error.message);

  const status = (count ?? 0) > 0 ? "needs_review" : "completed";
  const { error: updateErr } = await supabase.from("invoices").update({ status }).eq("id", invoiceId);
  if (updateErr) throw new Error("updating invoice status failed: " + updateErr.message);
  return status;
}

// §6.3, org-level half of the review gate: once unresolved lines across all
// invoices exceed organizations.max_unreviewed_line_items, the app shows the
// Action Required interstitial and refuses new scans until it's back under.
export async function getReviewBacklog(supabase: Client, orgId: string) {
  const [{ count, error }, { data: org, error: orgErr }] = await Promise.all([
    supabase
      .from("invoice_line_items")
      .select("id", { count: "exact", head: true })
      .in("match_status", [...UNRESOLVED_STATUSES]),
    supabase.from("organizations").select("max_unreviewed_line_items").eq("id", orgId).single(),
  ]);
  if (error) throw new Error("counting review backlog failed: " + error.message);
  if (orgErr || !org) throw new Error("reading org review cap failed: " + (orgErr?.message ?? "not found"));

  const unresolved = count ?? 0;
  const cap = org.max_unreviewed_line_items;
  return { unresolved, cap, blocked: unresolved > cap };
}

// Swipe-right (and the tail of create-ingredient): record the human's
// decision, remember this vendor's phrasing so it auto-matches next time,
// then apply the line's price — history, current cost, and past the org's
// threshold the price alert + margin-impact cascade (§5.2 step 8, §6.1).
export async function confirmLineItem(
  supabase: Client,
  { lineItemId, ingredientId, userId }: { lineItemId: string; ingredientId: string; userId: string },
) {
  const { data: line, error: lineErr } = await supabase
    .from("invoice_line_items")
    .select("id, org_id, invoice_id, raw_text, candidate_matches, invoices(vendor_id)")
    .eq("id", lineItemId)
    .single();
  if (lineErr || !line) return { error: "Line item not found", status: 404 as const };

  const { data: ingredient } = await supabase.from("ingredients").select("id").eq("id", ingredientId).maybeSingle();
  if (!ingredient) return { error: "Ingredient not found", status: 404 as const };

  const chosen = parseCandidates(line.candidate_matches).find((c) => c.ingredient_id === ingredientId);
  const { data: updated, error: updateErr } = await supabase
    .from("invoice_line_items")
    .update({
      matched_ingredient_id: ingredientId,
      match_status: "confirmed",
      // Similarity of the chosen candidate; null when the human picked an
      // ingredient the vector search didn't suggest.
      match_confidence: chosen?.similarity ?? null,
    })
    .eq("id", lineItemId)
    .select()
    .single();
  if (updateErr || !updated) return { error: updateErr?.message ?? "Update failed", status: 400 as const };

  const vendorId = line.invoices?.vendor_id ?? null;
  const rawTextNormalized = normalizeRawText(line.raw_text);
  let existingAlias = supabase
    .from("vendor_ingredient_aliases")
    .select("id, times_used")
    .eq("raw_text_normalized", rawTextNormalized);
  existingAlias = vendorId ? existingAlias.eq("vendor_id", vendorId) : existingAlias.is("vendor_id", null);
  const { data: found } = await existingAlias.maybeSingle();

  // Select-then-write rather than upsert: the unique key includes vendor_id,
  // and NULLs never conflict, so an upsert can't dedupe vendor-less aliases.
  // A human's latest decision wins if they re-map a phrase.
  const aliasWrite = found
    ? supabase
        .from("vendor_ingredient_aliases")
        .update({ ingredient_id: ingredientId, confirmed_by: userId, times_used: found.times_used + 1 })
        .eq("id", found.id)
    : supabase.from("vendor_ingredient_aliases").insert({
        org_id: line.org_id,
        vendor_id: vendorId,
        raw_text_normalized: rawTextNormalized,
        ingredient_id: ingredientId,
        confirmed_by: userId,
      });
  const { data: alias, error: aliasErr } = await aliasWrite.select().single();
  if (aliasErr) return { error: "Saving vendor alias failed: " + aliasErr.message, status: 400 as const };

  const price = await applyLinePrice(supabase, lineItemId);
  const invoiceStatus = await refreshInvoiceStatus(supabase, line.invoice_id);
  return { lineItem: updated, alias, price, invoiceStatus };
}
