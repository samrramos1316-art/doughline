import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { UNRESOLVED_STATUSES } from "@/lib/matching/review";
import { InvoiceStatusBadge } from "@/components/invoices/InvoiceStatusBadge";
import { LineItemStatusBadge } from "@/components/invoices/LineItemStatusBadge";
import { Panel, Kpi, PageHeader, ButtonLink, Empty, money, th, thNum, td, tdNum, row } from "@/components/ui/dash";
import { DeleteInvoiceButton } from "@/components/invoices/DeleteInvoiceButton";

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: invoice } = await supabase
    .from("invoices")
    .select(
      "id, status, invoice_number, invoice_date, total_amount, error_message, source_type, file_storage_path, file_type, vendors(name), invoice_line_items(id, raw_text, parsed_item_name, parsed_quantity, parsed_unit, parsed_unit_cost, parsed_line_total, match_status, match_confidence, base_unit_cost, price_note, created_at, ingredients(name, base_unit))",
    )
    .eq("id", id)
    .order("created_at", { referencedTable: "invoice_line_items", ascending: true })
    .order("position", { referencedTable: "invoice_line_items", ascending: true })
    .maybeSingle();
  if (!invoice) notFound();
  const { data: signed } = await supabase.storage.from("invoices").createSignedUrl(invoice.file_storage_path, 3600);

  const lineItems = invoice.invoice_line_items;
  const open = lineItems.filter((li) => (UNRESOLVED_STATUSES as readonly string[]).includes(li.match_status)).length;
  const priced = lineItems.filter((li) => li.base_unit_cost != null).length;
  const lineSum = lineItems.reduce((s, l) => s + Number(l.parsed_line_total ?? 0), 0);
  const busy = invoice.status === "pending" || invoice.status === "processing";

  return (
    <>
      <PageHeader
        title={invoice.vendors?.name ?? "Unknown vendor"}
        subtitle={
          <>
            <Link href="/invoices" className="underline">Invoices</Link>
            {" · "}
            {invoice.invoice_date ?? "No date yet"}
            {invoice.invoice_number ? ` · ${invoice.invoice_number}` : ""} · {invoice.source_type === "bulk_upload" ? "imported" : "scanned"}
          </>
        }
        actions={
          <>
            <InvoiceStatusBadge status={invoice.status} />
            {!busy && <ButtonLink href={`/invoices/${invoice.id}/manual-entry`}>{invoice.status === "failed" ? "Enter by hand" : "Add or correct lines"}</ButtonLink>}
            {open > 0 && <ButtonLink href={`/invoices/${invoice.id}/review`} primary>Review {open} →</ButtonLink>}
            {!busy && lineItems.length === 0 && <DeleteInvoiceButton invoiceId={invoice.id} />}
          </>
        }
      />

      {invoice.status === "failed" && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          We couldn&apos;t read this invoice automatically{invoice.error_message ? ` (${invoice.error_message})` : ""}.{" "}
          <Link href={`/invoices/${invoice.id}/manual-entry`} className="font-medium underline">Enter its line items by hand</Link> — it takes a minute. If it&apos;s a blank page, a duplicate or the wrong file, delete it instead.
        </p>
      )}
      {busy && <p className="mb-4 rounded-lg border border-stone-200 bg-white px-4 py-3 text-sm text-stone-500">Still reading — line items will show up here shortly.</p>}

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Invoice total" value={money(invoice.total_amount == null ? (lineSum || null) : Number(invoice.total_amount))} sub={invoice.total_amount == null && lineSum ? "sum of the lines" : "as printed"} />
        <Kpi label="Lines" value={lineItems.length} />
        <Kpi label="To check" value={open} tone={open ? "warning" : "good"} href={open ? `/invoices/${invoice.id}/review` : undefined} />
        <Kpi label="Prices applied" value={`${priced}/${lineItems.length}`} tone={priced ? "good" : "neutral"} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Panel title="Line items" flush className="xl:col-span-8">
          {lineItems.length === 0 ? (
            <Empty>No line items{busy ? " yet" : ""}.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className={th}>As printed</th>
                    <th className={thNum}>Qty</th>
                    <th className={thNum}>Unit price</th>
                    <th className={thNum}>Amount</th>
                    <th className={th}>Matched to</th>
                    <th className={thNum}>Your cost</th>
                    <th className={th}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((li) => (
                    <tr key={li.id} className={`${row} align-top`}>
                      <td className={`${td} whitespace-normal`}>
                        <span className="font-medium text-stone-900">{li.raw_text}</span>
                        {li.parsed_item_name && <span className="block text-[11px] text-stone-500 italic">{li.parsed_item_name}</span>}
                      </td>
                      <td className={tdNum}>{li.parsed_quantity ?? "—"} {li.parsed_unit ?? ""}</td>
                      <td className={tdNum}>{li.parsed_unit_cost != null ? money(Number(li.parsed_unit_cost)) : "—"}</td>
                      <td className={tdNum}>{li.parsed_line_total != null ? money(Number(li.parsed_line_total)) : "—"}</td>
                      <td className={td}>{li.ingredients?.name ?? "—"}</td>
                      <td className={`${tdNum} whitespace-normal`}>
                        {li.base_unit_cost != null ? `$${Number(li.base_unit_cost).toFixed(4)}/${li.ingredients?.base_unit ?? "unit"}` : "—"}
                        {li.price_note && <span className="block text-[11px] text-amber-700">{li.price_note}</span>}
                      </td>
                      <td className={td}><LineItemStatusBadge status={li.match_status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
        <Panel title="Original" className="xl:col-span-4">
          {!signed?.signedUrl ? (
            <p className="text-sm text-stone-400">File unavailable.</p>
          ) : invoice.file_type === "pdf" ? (
            <iframe title="Original invoice PDF" src={signed.signedUrl} className="h-[60vh] w-full rounded border border-stone-200" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- short-lived signed Storage URL, not a static asset
            <img src={signed.signedUrl} alt="Original invoice" className="w-full rounded border border-stone-200" />
          )}
        </Panel>
      </div>
    </>
  );
}
