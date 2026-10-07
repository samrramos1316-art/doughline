import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadReviewQueue } from "@/lib/matching/queue";
import { SwipeDeck } from "@/components/swipe/SwipeDeck";
import { getIndustry } from "@/lib/supabase/vocab";
import { formSuggestions } from "@/lib/industries";

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, invoice_number, vendors(name)")
    .eq("id", id)
    .maybeSingle();
  if (!invoice) notFound();

  const { lineItems, ingredients } = await loadReviewQueue(supabase, id);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Review matches</h1>
        <p className="text-sm text-zinc-500">
          {invoice.vendors?.name ?? "Unknown vendor"}
          {invoice.invoice_number ? ` · ${invoice.invoice_number}` : ""}
        </p>
      </div>
      <SwipeDeck
        lineItems={lineItems}
        ingredients={ingredients}
        doneHref={`/invoices/${id}`}
        doneLabel="Back to invoice"
        suggest={formSuggestions(await getIndustry())}
      />
    </div>
  );
}
