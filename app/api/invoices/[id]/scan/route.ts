import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getVisionProvider } from "@/lib/ai/vision";

const EXT_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  pdf: "application/pdf",
};

// §5.2 step 4: fetch the file from Storage, run it through the configured
// VisionProvider (VISION_PROVIDER — the Claude provider is real; Gemini is
// still a stub that extracts nothing), persist raw_extraction, and apply the
// status transitions described in §5.2 step 4.
//
// Not yet wired (deliberately out of scope for this scaffold): per-line-item
// normalization + Voyage embedding + alias/vector matching, §5.2 step 5 — that
// needs a Voyage API key and the matching logic, neither of which exist yet.
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

  await supabase
    .from("invoices")
    .update({
      status: "processing",
      raw_extraction: JSON.parse(JSON.stringify(extraction)),
      vendor_id: null, // TODO: resolve vendor_name_guess -> vendors row once matching (§5.2 step 5) exists
      invoice_number: extraction.invoice_number_guess,
      invoice_date: extraction.invoice_date_guess,
    })
    .eq("id", id);

  // TODO: for each line item — normalize raw_text, insert invoice_line_items,
  // compute + store its Voyage embedding, then run alias/vector matching
  // (§5.2 step 5) to set match_status. None of that is wired yet.
  const lineItemRows = extraction.line_items.map((item) => ({
    org_id: invoice.org_id,
    invoice_id: id,
    raw_text: item.raw_text,
    parsed_quantity: item.quantity,
    parsed_unit: item.unit,
    parsed_unit_cost: item.unit_cost,
    parsed_line_total: item.line_total,
    entry_method: "vision" as const,
  }));

  const { error: lineItemsErr } = await supabase.from("invoice_line_items").insert(lineItemRows);
  if (lineItemsErr) {
    return NextResponse.json({ error: lineItemsErr.message }, { status: 400 });
  }

  return NextResponse.json({ invoice_id: id, status: "processing", extraction });
}
