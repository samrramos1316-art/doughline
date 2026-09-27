import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { UNRESOLVED_STATUSES } from "@/lib/matching/review";
import { InvoiceStatusBadge } from "@/components/invoices/InvoiceStatusBadge";
import { LineItemStatusBadge } from "@/components/invoices/LineItemStatusBadge";

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: invoice } = await supabase
    .from("invoices")
    .select(
      "id, status, invoice_number, invoice_date, error_message, vendors(name), invoice_line_items(id, raw_text, parsed_item_name, parsed_quantity, parsed_unit, parsed_unit_cost, match_status, match_confidence, base_unit_cost, price_note, created_at, ingredients(name, base_unit))",
    )
    .eq("id", id)
    .order("created_at", { referencedTable: "invoice_line_items", ascending: true })
    .maybeSingle();
  if (!invoice) notFound();

  const lineItems = invoice.invoice_line_items;
  const needsReviewCount = lineItems.filter((li) =>
    (UNRESOLVED_STATUSES as readonly string[]).includes(li.match_status),
  ).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">{invoice.vendors?.name ?? "Unknown vendor"}</h1>
          <p className="text-sm text-zinc-500">
            {invoice.invoice_date ?? "No date yet"}
            {invoice.invoice_number ? ` · ${invoice.invoice_number}` : ""}
          </p>
        </div>
        <InvoiceStatusBadge status={invoice.status} />
      </div>

      {invoice.status === "failed" && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          We couldn&apos;t read this invoice automatically
          {invoice.error_message ? ` (${invoice.error_message})` : ""}. Enter its line items by hand instead.
        </p>
      )}

      {(invoice.status === "pending" || invoice.status === "processing") && (
        <p className="rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-500">
          Still processing — line items will show up here shortly.
        </p>
      )}

      {needsReviewCount > 0 && (
        <Link
          href={`/invoices/${invoice.id}/review`}
          className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800"
        >
          {needsReviewCount} line item{needsReviewCount === 1 ? "" : "s"} need your review
          <span aria-hidden>&rarr;</span>
        </Link>
      )}

      {lineItems.length > 0 && (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-zinc-500">
              <th className="py-2">Line</th>
              <th>Qty</th>
              <th>Unit cost</th>
              <th>Matched to</th>
              <th>Cost applied</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {lineItems.map((li) => (
              <tr key={li.id} className="border-b border-zinc-100">
                <td className="py-2">
                  {li.raw_text}
                  {li.parsed_item_name && (
                    <span className="block text-xs text-zinc-500 italic">{li.parsed_item_name}</span>
                  )}
                </td>
                <td>
                  {li.parsed_quantity ?? "—"} {li.parsed_unit ?? ""}
                </td>
                <td>{li.parsed_unit_cost != null ? `$${Number(li.parsed_unit_cost).toFixed(2)}` : "—"}</td>
                <td className="text-zinc-700">{li.ingredients?.name ?? "—"}</td>
                <td className="text-zinc-700">
                  {li.base_unit_cost != null
                    ? `$${Number(li.base_unit_cost).toFixed(4)}/${li.ingredients?.base_unit ?? "unit"}`
                    : "—"}
                  {li.price_note && <span className="block text-xs text-amber-700">{li.price_note}</span>}
                </td>
                <td>
                  <LineItemStatusBadge status={li.match_status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
