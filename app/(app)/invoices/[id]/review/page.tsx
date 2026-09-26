import { notFound } from "next/navigation";
import { getMockInvoice } from "@/lib/mock/invoices";
import { SwipeDeck } from "@/components/swipe/SwipeDeck";

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const invoice = getMockInvoice(id);
  if (!invoice) notFound();

  const needsReview = invoice.line_items.filter((li) =>
    ["needs_review", "new_ingredient", "pending"].includes(li.match_status),
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Review matches</h1>
        <p className="text-sm text-zinc-500">
          {invoice.vendor_name}
          {invoice.invoice_number ? ` · ${invoice.invoice_number}` : ""}
        </p>
      </div>
      <SwipeDeck lineItems={needsReview} />
    </div>
  );
}
