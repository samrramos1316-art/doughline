import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { logOutAction } from "@/app/(marketing)/auth-actions";

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

  return (
    <div className="flex min-h-full flex-1 flex-col bg-zinc-50">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3">
        <nav className="flex gap-4 text-sm font-medium text-zinc-700">
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/invoices">Invoices</Link>
          <Link href="/ingredients">Ingredients</Link>
          <Link href="/recipes">Recipes</Link>
          <Link href="/menu">Menu</Link>
          <Link href="/alerts">Alerts</Link>
          <Link href="/market">Market</Link>
        </nav>
        <form action={logOutAction}>
          <button type="submit" className="text-sm text-zinc-500 underline">
            Log out
          </button>
        </form>
      </header>
      <main className="flex flex-1 flex-col px-4 py-6">{children}</main>
    </div>
  );
}
