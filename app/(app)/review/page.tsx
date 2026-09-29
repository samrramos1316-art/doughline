import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";
import { loadReviewQueue } from "@/lib/matching/queue";
import { getReviewBacklog, UNRESOLVED_STATUSES } from "@/lib/matching/review";
import { SwipeDeck } from "@/components/swipe/SwipeDeck";
import { PageHeader, Panel, Kpi } from "@/components/ui/dash";

// Org-wide swipe-to-verify queue — where the §6.3 Action Required
// interstitial sends the owner: every unresolved line across all invoices.
export default async function ReviewQueuePage() {
  const supabase = await createClient();
  const orgId = await getCurrentOrgId(supabase);
  if (!orgId) redirect("/login");

  const [{ lineItems, ingredients }, backlog, { data: byInvoice }] = await Promise.all([
    loadReviewQueue(supabase),
    getReviewBacklog(supabase, orgId),
    supabase.from("invoice_line_items").select("invoice_id, invoices(invoice_number, invoice_date, vendors(name))").in("match_status", [...UNRESOLVED_STATUSES]),
  ]);
  const groups = new Map<string, { label: string; date: string | null; n: number }>();
  for (const l of byInvoice ?? []) {
    const g = groups.get(l.invoice_id) ?? { label: `${l.invoices?.vendors?.name ?? "Unknown vendor"}${l.invoices?.invoice_number ? ` · ${l.invoices.invoice_number}` : ""}`, date: l.invoices?.invoice_date ?? null, n: 0 };
    g.n += 1;
    groups.set(l.invoice_id, g);
  }

  return (
    <>
      <PageHeader
        title="Match invoice lines"
        subtitle={`${backlog.unresolved} unreviewed line item${backlog.unresolved === 1 ? "" : "s"} across all invoices${backlog.blocked ? ` — scanning is paused until this is ${backlog.cap} or fewer` : ""}`}
      />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="rounded-lg border border-stone-200 bg-white px-4 py-6 xl:col-span-8">
          <SwipeDeck lineItems={lineItems} ingredients={ingredients} doneHref="/invoices" doneLabel="Go to invoices" />
        </div>
        <div className="flex flex-col gap-4 xl:col-span-4">
          <div className="grid grid-cols-2 gap-3">
            <Kpi label="To check" value={backlog.unresolved} tone={backlog.blocked ? "critical" : backlog.unresolved ? "warning" : "good"} />
            <Kpi label="Scan limit" value={backlog.cap} sub="change in Settings" href="/settings" />
          </div>
          <Panel title="Waiting, by invoice" flush>
            {groups.size === 0 ? (
              <p className="px-3 py-4 text-sm text-stone-500">Nothing waiting.</p>
            ) : (
              <ul className="divide-y divide-stone-100">
                {[...groups.entries()].map(([id, g]) => (
                  <li key={id}>
                    <Link href={`/invoices/${id}/review`} className="flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-amber-50/50">
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-stone-900">{g.label}</span>
                        <span className="block text-[11px] text-stone-500">{g.date ?? "no date"}</span>
                      </span>
                      <span className="rounded bg-amber-100 px-1.5 text-xs font-semibold text-amber-800 tabular-nums">{g.n}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="How it works">
            <ul className="space-y-1.5 text-[13px] text-stone-600">
              <li><b className="text-stone-800">Confirm</b> — the suggestion is right; this supplier&apos;s wording is remembered.</li>
              <li><b className="text-stone-800">Not this</b> — show the next suggestion.</li>
              <li><b className="text-stone-800">Create new</b> — add it to your ingredients.</li>
              <li><b className="text-stone-800">Not an ingredient</b> — gloves, cleaning supplies, fees; remembered for next time.</li>
            </ul>
          </Panel>
        </div>
      </div>
    </>
  );
}
