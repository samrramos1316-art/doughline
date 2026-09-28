import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { UNRESOLVED_STATUSES, refreshInvoiceStatus } from "@/lib/matching/review";

// "Not an ingredient": gloves, sanitizer, a deposit — lines a food invoice
// carries that no recipe uses. Resolves the line without matching it, so the
// invoice can complete and the line stops counting toward the review gate
// (§6.3). No price is recorded.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: line, error: lineErr } = await supabase
    .from("invoice_line_items")
    .select("id, invoice_id, match_status")
    .eq("id", id)
    .single();
  if (lineErr || !line) return NextResponse.json({ error: "Line item not found" }, { status: 404 });
  if (!(UNRESOLVED_STATUSES as readonly string[]).includes(line.match_status)) {
    return NextResponse.json({ error: `Line item is '${line.match_status}', not awaiting review` }, { status: 409 });
  }

  const { data: updated, error } = await supabase
    .from("invoice_line_items")
    .update({ match_status: "not_ingredient", matched_ingredient_id: null, match_confidence: null })
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const invoiceStatus = await refreshInvoiceStatus(supabase, line.invoice_id);
  return NextResponse.json({ lineItem: updated, invoiceStatus });
}
