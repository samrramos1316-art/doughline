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
