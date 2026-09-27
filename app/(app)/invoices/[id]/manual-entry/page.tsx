import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { InvoiceStatusBadge } from "@/components/invoices/InvoiceStatusBadge";
import { ManualEntryClient, type ExistingLine } from "@/components/invoices/ManualEntryClient";

// §9.2: type (or paste) an invoice's lines when the scan couldn't read it —
// status 'failed' — or to add/fix lines a scan got wrong. The original file
// sits next to the grid so the owner can copy from it.
export default async function ManualEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: invoice } = await supabase
    .from("invoices")
    .select(
      "id, status, file_storage_path, file_type, invoice_number, invoice_date, error_message, vendors(name), invoice_line_items(id, raw_text, parsed_quantity, parsed_unit, parsed_unit_cost, parsed_line_total, parsed_pack_quantity, parsed_pack_unit, match_status, entry_method, base_unit_cost, price_applied_at, price_note, created_at, ingredients(name, base_unit))",
    )
    .eq("id", id)
    .order("created_at", { referencedTable: "invoice_line_items", ascending: true })
    .order("position", { referencedTable: "invoice_line_items", ascending: true })
    .maybeSingle();
  if (!invoice) notFound();

  const { data: signed } = await supabase.storage.from("invoices").createSignedUrl(invoice.file_storage_path, 3600);
  const { data: vendors } = await supabase.from("vendors").select("name").order("name");

  const lines: ExistingLine[] = invoice.invoice_line_items.map((l) => ({
    id: l.id,
    raw_text: l.raw_text,
    quantity: l.parsed_quantity,
    unit: l.parsed_unit,
    unit_cost: l.parsed_unit_cost,
    line_total: l.parsed_line_total,
    pack_quantity: l.parsed_pack_quantity,
    pack_unit: l.parsed_pack_unit,
    match_status: l.match_status,
    entry_method: l.entry_method,
    ingredient_name: l.ingredients?.name ?? null,
    base_unit: l.ingredients?.base_unit ?? null,
    base_unit_cost: l.base_unit_cost,
    price_applied: !!l.price_applied_at,
    price_note: l.price_note,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Enter invoice lines</h1>
          <p className="text-sm text-zinc-500">
            <Link href={`/invoices/${invoice.id}`} className="underline">
              {invoice.vendors?.name ?? "Unknown vendor"}
              {invoice.invoice_number ? ` · ${invoice.invoice_number}` : ""}
            </Link>
          </p>
        </div>
        <InvoiceStatusBadge status={invoice.status} />
      </div>

      {invoice.status === "failed" && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          We couldn&apos;t read this invoice automatically{invoice.error_message ? ` (${invoice.error_message})` : ""}.
          Type or paste its lines below — they&apos;re matched to your ingredients the same way a scan would be.
        </p>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <ManualEntryClient
          invoiceId={invoice.id}
          header={{
            vendor_name: invoice.vendors?.name ?? "",
            invoice_number: invoice.invoice_number ?? "",
            invoice_date: invoice.invoice_date ?? "",
          }}
          vendorNames={(vendors ?? []).map((v) => v.name)}
          lines={lines}
        />
        <aside className="flex flex-col gap-2">
          <p className="text-sm font-medium text-zinc-700">Original file</p>
          {!signed?.signedUrl ? (
            <p className="text-sm text-zinc-400">File unavailable.</p>
          ) : invoice.file_type === "pdf" ? (
            <iframe title="Original invoice PDF" src={signed.signedUrl} className="h-[70vh] w-full rounded-lg border border-zinc-200" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- short-lived signed Storage URL, not a static asset
            <img src={signed.signedUrl} alt="Original invoice" className="w-full rounded-lg border border-zinc-200" />
          )}
        </aside>
      </div>
    </div>
  );
}
