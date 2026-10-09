import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logOutAction } from "@/app/(marketing)/auth-actions";
import { getCurrentOrgId } from "@/lib/supabase/org";
import { getSessionUser } from "@/lib/supabase/user";
import { getReviewBacklog } from "@/lib/matching/review";
import { ActionRequiredGate } from "@/components/review/ActionRequiredGate";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import { Sidebar, MobileNav, type NavCounts } from "@/components/app/Sidebar";
import { getIndustry } from "@/lib/supabase/vocab";
import { VocabProvider } from "@/components/app/VocabProvider";
import { isAdmin } from "@/lib/admin/access";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const user = await getSessionUser();

  // proxy.ts already redirects unauthenticated visitors away from these
  // routes, but a Proxy matcher change shouldn't be the only thing standing
  // between an unauthenticated request and this layout (see Next.js's own
  // data-security guidance for Proxy).
  if (!user) redirect("/login");

  // Only the backlog needs the org id; RLS scopes the rest, so they start now.
  const [backlog, profile, alerts, failed, industry] = await Promise.all([
    getCurrentOrgId(supabase).then((orgId) => (orgId ? getReviewBacklog(supabase, orgId) : null)),
    supabase.from("profiles").select("full_name, organizations(name)").eq("id", user.id).maybeSingle(),
    supabase.from("price_alerts").select("id", { count: "exact", head: true }).eq("acknowledged", false).gt("pct_change", 0),
    supabase.from("invoices").select("id", { count: "exact", head: true }).eq("status", "failed"),
    getIndustry(),
  ]);
  const vocab = industry.vocab;
  const labels = { menu: vocab.menu, recipes: vocab.recipes, ingredients: vocab.ingredients, market: industry.hasMarketData, quote: industry.features.quote !== false };
  const counts: NavCounts = {
    review: backlog?.unresolved ?? 0,
    reviewBlocked: backlog?.blocked ?? false,
    alerts: alerts.count ?? 0,
    failed: failed.count ?? 0,
  };
  const business = profile.data?.organizations?.name ?? "Your business";
  const logOut = (
    <form action={logOutAction}>
      <button type="submit" className="text-stone-400 underline decoration-stone-600 underline-offset-2 hover:text-white">
        Log out
      </button>
    </form>
  );

  return (
    <VocabProvider vocab={vocab}>
    <div className="flex min-h-dvh flex-1 bg-[#f3f1ed]">
      {backlog?.blocked && <ActionRequiredGate unresolved={backlog.unresolved} cap={backlog.cap} />}
      {/* The rail's dark background runs the full page height; the rail itself stays pinned. */}
      <div className="hidden shrink-0 bg-[#1a1714] lg:block">
        <Sidebar business={business} owner={profile.data?.full_name ?? user.email ?? null} counts={counts} logOut={logOut} admin={isAdmin(user.email)} labels={labels} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileNav business={business} counts={counts} admin={isAdmin(user.email)} labels={labels} />
        <main className="flex min-w-0 flex-1 flex-col px-4 py-4 lg:px-6 lg:py-5">{children}</main>
        <div className="flex justify-end px-4 pb-4 lg:hidden">{logOut}</div>
      </div>
      <InstallPrompt />
    </div>
    </VocabProvider>
  );
}
