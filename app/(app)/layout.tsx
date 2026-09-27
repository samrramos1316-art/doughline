import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { logOutAction } from "@/app/(marketing)/auth-actions";
import { getCurrentOrgId } from "@/lib/supabase/org";
import { getReviewBacklog } from "@/lib/matching/review";
import { ActionRequiredGate } from "@/components/review/ActionRequiredGate";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // proxy.ts already redirects unauthenticated visitors away from these
  // routes, but a Proxy matcher change shouldn't be the only thing standing
  // between an unauthenticated request and this layout (see Next.js's own
  // data-security guidance for Proxy).
  if (!user) redirect("/login");

  const orgId = await getCurrentOrgId(supabase);
  const backlog = orgId ? await getReviewBacklog(supabase, orgId) : null;

  return (
    <div className="flex min-h-full flex-1 flex-col bg-zinc-50">
      {backlog?.blocked && <ActionRequiredGate unresolved={backlog.unresolved} cap={backlog.cap} />}
      <header className="flex items-start justify-between gap-4 border-b border-zinc-200 bg-white px-4 py-3">
        {/* Wraps rather than overflowing: on a phone a single row is wider
            than the screen, which scrolls the page sideways and leaves part
            of it outside the full-screen Action Required gate. */}
        <nav className="flex flex-wrap gap-x-4 gap-y-2 text-sm font-medium text-zinc-700">
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/invoices">Invoices</Link>
          <Link href="/review" className={backlog?.unresolved ? "text-amber-700" : undefined}>
            Review{backlog?.unresolved ? ` (${backlog.unresolved})` : ""}
          </Link>
          <Link href="/ingredients">Ingredients</Link>
          <Link href="/recipes">Recipes</Link>
          <Link href="/menu">Menu</Link>
          <Link href="/alerts">Alerts</Link>
          <Link href="/market">Market</Link>
        </nav>
        <form action={logOutAction}>
          <button type="submit" className="whitespace-nowrap text-sm text-zinc-500 underline">
            Log out
          </button>
        </form>
      </header>
      <main className="flex flex-1 flex-col px-4 py-6">{children}</main>
      <InstallPrompt />
    </div>
  );
}
