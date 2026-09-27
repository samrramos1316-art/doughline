import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getVisionProvider } from "@/lib/ai/vision";
import { matchLines, type LineMatch } from "@/lib/matching/vectorMatch";
import { resolveVendorId } from "@/lib/matching/vendors";
import { refreshInvoiceStatus } from "@/lib/matching/review";
import { applyLinePrice } from "@/lib/costing/applyPrice";

// Claude and Voyage calls (Voyage retries 429s on its free tier) can take
// most of a minute; don't let the platform's default timeout cut them off.
export const maxDuration = 300;

const EXT_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  pdf: "application/pdf",
};

// §5.2 step 4: fetch the file from Storage, run it through the configured
// VisionProvider (VISION_PROVIDER — the Claude provider is real; Gemini is
// still a stub that extracts nothing), persist raw_extraction, and apply the
// status transitions described in §5.2 step 4, then match every line (§5.2
// step 5: vendor alias → Voyage vector search → confidence routing) and set
// the invoice to 'needs_review' or 'completed' (step 6). Auto-matched lines
// have their price applied here (step 8) — nobody will confirm them, and the
// alias fast path means most lines end up auto-matched.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: invoice, error: invoiceErr } = await supabase
    .from("invoices")
    .select("id, org_id, file_storage_path, file_type")
    .eq("id", id)
    .single();
  if (invoiceErr || !invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  const { data: fileBlob, error: downloadErr } = await supabase.storage
    .from("invoices")
    .download(invoice.file_storage_path);
  if (downloadErr || !fileBlob) {
    return NextResponse.json({ error: "Could not read invoice file from Storage" }, { status: 400 });
  }
  const fileBuffer = Buffer.from(await fileBlob.arrayBuffer());
  const ext = invoice.file_storage_path.split(".").pop() ?? "";
  const mimeType = EXT_TO_MIME[ext] ?? (invoice.file_type === "pdf" ? "application/pdf" : "image/jpeg");

  const provider = getVisionProvider();

  let extraction;
  try {
    extraction = await provider.extractInvoice(fileBuffer, mimeType);
  } catch (err) {
    await supabase
      .from("invoices")
      .update({
        status: "failed",
        error_message: err instanceof Error ? err.message : "Vision extraction failed",
      })
      .eq("id", id);
    return NextResponse.json({ error: "Vision extraction failed" }, { status: 502 });
  }

  if (extraction.line_items.length === 0) {
    await supabase
      .from("invoices")
      .update({
        status: "failed",
        raw_extraction: JSON.parse(JSON.stringify(extraction)),
        error_message: "No line items extracted",
      })
      .eq("id", id);
    return NextResponse.json({ invoice_id: id, status: "failed", extraction });
  }

  let vendorId: string | null = null;
  try {
    vendorId = await resolveVendorId(supabase, invoice.org_id, extraction.vendor_name_guess);
  } catch {
    // An unresolved vendor only costs alias memory for this invoice (aliases
    // then key on vendor_id null); not worth failing the scan over.
  }

  await supabase
    .from("invoices")
    .update({
      status: "processing",
      raw_extraction: JSON.parse(JSON.stringify(extraction)),
      vendor_id: vendorId,
      invoice_number: extraction.invoice_number_guess,
      invoice_date: extraction.invoice_date_guess,
    })
    .eq("id", id);

  // If matching itself fails (e.g. Voyage is down), still keep the extracted
  // lines — as 'pending', with no candidates — so they reach the review queue
  // for a manual pick instead of vanishing (§9: the AI path is the happy
  // path, not the only path).
  let matches: (LineMatch | null)[];
  let matchingError: string | null = null;
  try {
    matches = await matchLines(supabase, { vendorId, lines: extraction.line_items });
  } catch (err) {
    matchingError = err instanceof Error ? err.message : "Matching failed";
    console.error(`[scan] matching failed for invoice ${id}; lines saved as 'pending':`, err);
    matches = extraction.line_items.map(() => null);
  }

  const lineItemRows = extraction.line_items.map((item, i) => {
    const match = matches[i];
    return {
      org_id: invoice.org_id,
      invoice_id: id,
      raw_text: item.raw_text,
      parsed_item_name: item.item_name,
      parsed_quantity: item.quantity,
      parsed_unit: item.unit,
      parsed_unit_cost: item.unit_cost,
      parsed_line_total: item.line_total,
      parsed_pack_quantity: item.pack_quantity,
      parsed_pack_unit: item.pack_unit,
      entry_method: "vision" as const,
      embedding: match?.embedding ?? null,
      match_status: match?.match_status ?? ("pending" as const),
      matched_ingredient_id: match?.matched_ingredient_id ?? null,
      match_confidence: match?.match_confidence ?? null,
      candidate_matches: match?.candidate_matches ?? null,
    };
  });

  const { data: lineItems, error: lineItemsErr } = await supabase
    .from("invoice_line_items")
    .insert(lineItemRows)
    .select(
      "id, raw_text, parsed_item_name, parsed_quantity, parsed_unit, parsed_unit_cost, parsed_line_total, match_status, matched_ingredient_id, match_confidence, candidate_matches",
    );
  if (lineItemsErr) {
    return NextResponse.json({ error: lineItemsErr.message }, { status: 400 });
  }

  // Sequential: two lines of one invoice can hit the same ingredient, and
  // each must see the cost the previous one set.
  const prices = [];
  for (const li of lineItems.filter((l) => l.match_status === "auto_matched")) {
    prices.push({ line_item_id: li.id, ...(await applyLinePrice(supabase, li.id)) });
  }

  const status = await refreshInvoiceStatus(supabase, id);

  return NextResponse.json({
    invoice_id: id,
    status,
    vendor_id: vendorId,
    matching_error: matchingError,
    extraction,
    line_items: lineItems,
    prices,
  });
}
