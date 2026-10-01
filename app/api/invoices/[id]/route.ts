import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { updateInvoiceSchema } from "@/lib/validators/invoice";
import { resolveVendorId } from "@/lib/matching/vendors";

// §9.2: the header fields an owner fills in when a scan couldn't read them.
// The vendor matters beyond display — it keys vendor_ingredient_aliases, so
// setting it lets typed lines hit that vendor's remembered phrasings.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const parsed = updateInvoiceSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const { data: invoice } = await supabase.from("invoices").select("id, org_id").eq("id", id).maybeSingle();
  if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  const { vendor_name, ...fields } = parsed.data;
  const updates: { vendor_id?: string | null; invoice_number?: string | null; invoice_date?: string | null } = { ...fields };
  if (vendor_name !== undefined) {
    updates.vendor_id = vendor_name ? await resolveVendorId(supabase, invoice.org_id, vendor_name) : null;
  }

  const { data: updated, error } = await supabase
    .from("invoices")
    .update(updates)
    .eq("id", id)
    .select("id, status, vendor_id, invoice_number, invoice_date, vendors(name)")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ invoice: updated });
}

// Remove an upload that has nothing on it — a blank page, a duplicate, the
// wrong file — so it stops showing as "Couldn't read". Only for invoices with
// no line items: once lines exist their prices may already be in ingredient
// costs and history, and deleting would leave those pointing at nothing.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: invoice } = await supabase.from("invoices").select("id, status, file_storage_path, invoice_line_items(count)").eq("id", id).maybeSingle();
  if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  if (invoice.status === "pending" || invoice.status === "processing") {
    return NextResponse.json({ error: "It's still being read — try again in a minute" }, { status: 409 });
  }
  if ((invoice.invoice_line_items[0]?.count ?? 0) > 0) {
    return NextResponse.json({ error: "This invoice has line items, so it can't be deleted — its prices may already be in your costs" }, { status: 409 });
  }
  const { error } = await supabase.from("invoices").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  // The file goes too; a leftover file only costs storage, so don't fail on it.
  await supabase.storage.from("invoices").remove([invoice.file_storage_path]);
  return NextResponse.json({ ok: true });
}
