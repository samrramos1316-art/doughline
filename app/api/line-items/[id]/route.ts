import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import { updateLineItemSchema } from "@/lib/validators/lineItem";
import { matchLines } from "@/lib/matching/vectorMatch";
import { UNRESOLVED_STATUSES, refreshInvoiceStatus } from "@/lib/matching/review";
import { applyLinePrice, type PriceOutcome } from "@/lib/costing/applyPrice";
import { LINE_ITEM_RETURN_COLUMNS } from "@/lib/invoices/lines";
import { expandItemNames } from "@/lib/ai/itemNames";

// Re-matching embeds via Voyage, which retries 429s on its free tier.
export const maxDuration = 300;

const PRICE_FIELDS = ["unit", "unit_cost", "pack_quantity", "pack_unit"] as const;

// §9.2: correct any parsed field on a line, scanned or typed.
//   - item text changed on a line still awaiting review → matched again
//   - a matched line whose price couldn't be applied (price_note, e.g. no
//     pack size) → price retried after the fix
//   - a price already in the ingredient's costs can't be edited from here:
//     that would silently rewrite history and any alert it raised.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const parsed = updateLineItemSchema.safeParse(await request.json());
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: issue ? `${issue.path.join(".")}: ${issue.message}` : "Invalid input" }, { status: 400 });
  }
  const patch = parsed.data;

  const { data: line } = await supabase
    .from("invoice_line_items")
    .select("id, invoice_id, raw_text, parsed_unit, parsed_unit_cost, parsed_pack_quantity, parsed_pack_unit, match_status, price_applied_at, invoices(vendor_id)")
    .eq("id", id)
    .maybeSingle();
  if (!line) return NextResponse.json({ error: "Line item not found" }, { status: 404 });

  const current = {
    unit: line.parsed_unit,
    unit_cost: line.parsed_unit_cost,
    pack_quantity: line.parsed_pack_quantity,
    pack_unit: line.parsed_pack_unit,
  };
  const priceFieldChanged = PRICE_FIELDS.some(
    (f) => patch[f] !== undefined && (patch[f] ?? null) !== (current[f] ?? null),
  );
  if (line.price_applied_at && priceFieldChanged) {
    return NextResponse.json(
      { error: "This line's price is already in your ingredient costs, so its price fields can't be changed here" },
      { status: 409 },
    );
  }

  const updates: Database["public"]["Tables"]["invoice_line_items"]["Update"] = {};
  if (patch.raw_text !== undefined) updates.raw_text = patch.raw_text;
  if (patch.quantity !== undefined) updates.parsed_quantity = patch.quantity;
  if (patch.unit !== undefined) updates.parsed_unit = patch.unit || null;
  if (patch.unit_cost !== undefined) updates.parsed_unit_cost = patch.unit_cost;
  if (patch.line_total !== undefined) updates.parsed_line_total = patch.line_total;
  if (patch.pack_quantity !== undefined) updates.parsed_pack_quantity = patch.pack_quantity;
  if (patch.pack_unit !== undefined) updates.parsed_pack_unit = patch.pack_unit || null;

  const newText = patch.raw_text;
  const unresolved = (UNRESOLVED_STATUSES as readonly string[]).includes(line.match_status);
  if (newText !== undefined && newText !== line.raw_text && unresolved) {
    const [itemName] = await expandItemNames([newText]);
    try {
      const [m] = await matchLines(supabase, {
        vendorId: line.invoices?.vendor_id ?? null,
        lines: [{ raw_text: newText, item_name: itemName }],
      });
      Object.assign(updates, {
        parsed_item_name: itemName,
        embedding: m.embedding,
        match_status: m.match_status,
        matched_ingredient_id: m.matched_ingredient_id,
        match_confidence: m.match_confidence,
        candidate_matches: m.candidate_matches,
      });
    } catch (err) {
      console.error(`[line-items] re-match failed for ${id}:`, err);
      Object.assign(updates, { embedding: null, match_status: "pending", candidate_matches: null, match_confidence: null });
    }
  }

  const { error } = await supabase.from("invoice_line_items").update(updates).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Matched but not yet priced — either just re-matched to an alias, or a
  // fix (pack size, unit) may have made the price convertible.
  const { data: after } = await supabase
    .from("invoice_line_items")
    .select("match_status, price_applied_at")
    .eq("id", id)
    .single();
  let price: PriceOutcome | null = null;
  if (after && !after.price_applied_at && ["auto_matched", "confirmed"].includes(after.match_status)) {
    price = await applyLinePrice(supabase, id);
  }

  const invoiceStatus = await refreshInvoiceStatus(supabase, line.invoice_id);
  const { data: lineItem } = await supabase
    .from("invoice_line_items")
    .select(`${LINE_ITEM_RETURN_COLUMNS}, base_unit_cost, price_note`)
    .eq("id", id)
    .single();
  return NextResponse.json({ lineItem, price, invoiceStatus });
}
