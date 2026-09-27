import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";
import { loadReviewQueue } from "@/lib/matching/queue";
import { getReviewBacklog } from "@/lib/matching/review";
import { SwipeDeck } from "@/components/swipe/SwipeDeck";
import { redirect } from "next/navigation";

// Org-wide swipe-to-verify queue — where the §6.3 Action Required
// interstitial sends the owner: every unresolved line across all invoices.
export default async function ReviewQueuePage() {
  const supabase = await createClient();
  const orgId = await getCurrentOrgId(supabase);
  if (!orgId) redirect("/login");

  const [{ lineItems, ingredients }, backlog] = await Promise.all([
    loadReviewQueue(supabase),
    getReviewBacklog(supabase, orgId),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Review queue</h1>
        <p className="text-sm text-zinc-500">
          {backlog.unresolved} unreviewed line item{backlog.unresolved === 1 ? "" : "s"} across all invoices
          {backlog.blocked && ` — scanning is paused until this is ${backlog.cap} or fewer`}
        </p>
      </div>
      <SwipeDeck lineItems={lineItems} ingredients={ingredients} doneHref="/invoices" doneLabel="Go to invoices" />
    </div>
  );
}
