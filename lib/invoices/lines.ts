import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { ExtractedLineItem } from "@/lib/ai/vision/types";
import { matchLines, type LineMatch } from "@/lib/matching/vectorMatch";
import { refreshInvoiceStatus } from "@/lib/matching/review";
import { applyLinePrice, type PriceOutcome } from "@/lib/costing/applyPrice";

type Client = SupabaseClient<Database>;

export const LINE_ITEM_RETURN_COLUMNS =
  "id, raw_text, parsed_item_name, parsed_quantity, parsed_unit, parsed_unit_cost, parsed_line_total, parsed_pack_quantity, parsed_pack_unit, match_status, matched_ingredient_id, match_confidence, candidate_matches, entry_method";

// §5.2 steps 5-8 for a batch of lines on one invoice, whether they came from
// the vision model or were typed into the manual-entry grid (§9.2 — "a
// manually-typed line gets the same smart matching a scanned one would"):
// vendor alias → Voyage vector search → confidence routing → insert →
// apply prices for auto-matched lines → refresh the invoice's status.
//
// If matching itself fails (e.g. Voyage is down), the lines are still saved
// — as 'pending', with no candidates — so they reach the review queue for a
// manual pick instead of vanishing.
export async function insertAndMatchLines(
  supabase: Client,
  {
    orgId,
    invoiceId,
    vendorId,
    lines,
    entryMethod,
  }: {
    orgId: string;
    invoiceId: string;
    vendorId: string | null;
    lines: ExtractedLineItem[];
    entryMethod: "vision" | "manual";
  },
) {
  let matches: (LineMatch | null)[];
  let matchingError: string | null = null;
  try {
    matches = await matchLines(supabase, { vendorId, lines });
  } catch (err) {
    matchingError = err instanceof Error ? err.message : "Matching failed";
    console.error(`[lines] matching failed for invoice ${invoiceId}; lines saved as 'pending':`, err);
    matches = lines.map(() => null);
  }

  const rows = lines.map((item, i) => {
    const match = matches[i];
    return {
      org_id: orgId,
      invoice_id: invoiceId,
      raw_text: item.raw_text,
      parsed_item_name: item.item_name,
      parsed_quantity: item.quantity,
      parsed_unit: item.unit,
      parsed_unit_cost: item.unit_cost,
      parsed_line_total: item.line_total,
      parsed_pack_quantity: item.pack_quantity,
      parsed_pack_unit: item.pack_unit,
      entry_method: entryMethod,
      position: i,
      embedding: match?.embedding ?? null,
      match_status: match?.match_status ?? ("pending" as const),
      matched_ingredient_id: match?.matched_ingredient_id ?? null,
      match_confidence: match?.match_confidence ?? null,
      candidate_matches: match?.candidate_matches ?? null,
    };
  });

  const { data: lineItems, error } = await supabase
    .from("invoice_line_items")
    .insert(rows)
    .select(LINE_ITEM_RETURN_COLUMNS);
  if (error) throw new Error(error.message);

  // Sequential: two lines of one invoice can hit the same ingredient, and
  // each must see the cost the previous one set.
  const prices: ({ line_item_id: string } & PriceOutcome)[] = [];
  for (const li of lineItems.filter((l) => l.match_status === "auto_matched")) {
    prices.push({ line_item_id: li.id, ...(await applyLinePrice(supabase, li.id)) });
  }

  const status = await refreshInvoiceStatus(supabase, invoiceId);
  return { lineItems, prices, status, matchingError };
}
