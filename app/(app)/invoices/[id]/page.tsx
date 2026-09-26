import { notFound } from "next/navigation";
import Link from "next/link";
import { getMockInvoice } from "@/lib/mock/invoices";
import { InvoiceStatusBadge } from "@/components/invoices/InvoiceStatusBadge";
import { LineItemStatusBadge } from "@/components/invoices/LineItemStatusBadge";

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const invoice = getMockInvoice(id);
  if (!invoice) notFound();

  const needsReviewCount = invoice.line_items.filter((li) =>
    ["needs_review", "new_ingredient", "pending"].includes(li.match_status),
  ).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">{invoice.vendor_name}</h1>
          <p className="text-sm text-zinc-500">
            {invoice.invoice_date ?? "No date yet"}
            {invoice.invoice_number ? ` · ${invoice.invoice_number}` : ""}
          </p>
        </div>
        <InvoiceStatusBadge status={invoice.status} />
      </div>

      {invoice.status === "failed" && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          We couldn&apos;t read this invoice automatically. Enter its line items by hand instead.
        </p>
      )}

      {invoice.status === "pending" && (
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

      {invoice.line_items.length > 0 && (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-zinc-500">
              <th className="py-2">Line</th>
              <th>Qty</th>
              <th>Unit cost</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {invoice.line_items.map((li) => (
              <tr key={li.id} className="border-b border-zinc-100">
                <td className="py-2">{li.raw_text}</td>
                <td>
                  {li.parsed_quantity ?? "—"} {li.parsed_unit ?? ""}
                </td>
                <td>{li.parsed_unit_cost != null ? `$${li.parsed_unit_cost.toFixed(2)}` : "—"}</td>
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
