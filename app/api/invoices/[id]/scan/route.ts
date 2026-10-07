import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getVisionProvider } from "@/lib/ai/vision";
import { getIndustry } from "@/lib/supabase/vocab";
import { extractionHints } from "@/lib/industries/extraction";
import { resolveVendorId } from "@/lib/matching/vendors";
import { insertAndMatchLines } from "@/lib/invoices/lines";
import { ONBOARDING_FOLDER } from "@/lib/onboarding/upload";
import { wrongKindMessage } from "@/lib/onboarding/wrongKind";

const ONBOARDING_IMPORT_URL = "/onboarding/import";

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
// alias fast path means most lines end up auto-matched. PDFs (bulk import,
// §9.1) go to the provider as documents, images as images.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: invoice, error: invoiceErr } = await supabase
    .from("invoices")
    .select("id, org_id, file_storage_path, file_type, invoice_line_items(count)")
    .eq("id", id)
    .single();
  if (invoiceErr || !invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }
  // Scanning twice would insert every line twice. Once an invoice has lines,
  // corrections go through the manual-entry grid (§9.2).
  if ((invoice.invoice_line_items[0]?.count ?? 0) > 0) {
    return NextResponse.json({ error: "This invoice has already been read" }, { status: 409 });
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
    // The org's industry hints (none for food) go into the prompt.
    extraction = await provider.extractInvoice(fileBuffer, mimeType, { hints: extractionHints((await getIndustry()).id, "invoice") });
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

  // Not an invoice at all — never keep it as a failed invoice (or worse, as
  // a purchase from the business itself). A menu or recipe moves to the
  // onboarding folder so its import can read the same file straight away
  // (§9.3); anything else is removed. The reader leans to "invoice" when
  // unsure, so a hard-to-read receipt still lands below as a failed invoice
  // with "Enter by hand".
  if (extraction.document_type !== "invoice") {
    const kind = extraction.document_type;
    let importUrl: string | null = null;
    if (kind === "menu" || kind === "recipe") {
      const moved = `${invoice.org_id}/${ONBOARDING_FOLDER}/${id}.${ext || "jpg"}`;
      const { error: moveErr } = await supabase.storage.from("invoices").move(invoice.file_storage_path, moved);
      importUrl = `${ONBOARDING_IMPORT_URL}?kind=${kind}${moveErr ? "" : `&file=${encodeURIComponent(moved)}`}`;
    } else {
      await supabase.storage.from("invoices").remove([invoice.file_storage_path]);
    }
    await supabase.from("invoices").delete().eq("id", id);
    return NextResponse.json(
      { error: wrongKindMessage("invoice", kind), not_invoice: true, document_type: kind, import_url: importUrl },
      { status: 422 },
    );
  }

  // A real invoice with nothing legible fails with the reason and keeps
  // "Enter by hand".
  if (extraction.line_items.length === 0) {
    await supabase
      .from("invoices")
      .update({
        status: "failed",
        raw_extraction: JSON.parse(JSON.stringify(extraction)),
        error_message: "no purchased items could be read from it",
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
      total_amount: extraction.invoice_total_guess,
    })
    .eq("id", id);

  let result;
  try {
    result = await insertAndMatchLines(supabase, {
      orgId: invoice.org_id,
      invoiceId: id,
      vendorId,
      lines: extraction.line_items,
      entryMethod: "vision",
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Saving line items failed" }, { status: 400 });
  }
  const { lineItems, prices, status, matchingError } = result;

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
