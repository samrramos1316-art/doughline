import Link from "next/link";
import { Logo } from "./Logo";

// Two-panel frame for login / signup / check-email: the form on a light
// card, and — from md up — a dark brand panel with a real example of what
// the app tells you.
export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 bg-[#fbf7f0]">
      <aside className="relative hidden w-[44%] flex-col justify-between overflow-hidden bg-stone-900 p-10 text-stone-100 md:flex">
        <div aria-hidden className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-amber-500/20 blur-3xl" />
        <Link href="/" className="relative">
          <Logo light />
        </Link>
        <div className="relative max-w-sm">
          <p className="text-2xl leading-snug font-semibold text-white">
            Every invoice, read. Every price change, traced to your menu.
          </p>
          <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
            <p className="text-xs font-medium tracking-wide text-amber-300 uppercase">Price alert</p>
            <p className="mt-1 font-medium text-white">Unsalted butter $3.40 → $3.96/lb</p>
            <p className="text-sm text-stone-400">+16.5% · Bluebonnet invoice 7719-204583</p>
            <div className="mt-4 space-y-2 text-sm">
              {[
                ["Butter Croissant", "88.6%", "87.3%"],
                ["Cookie 6-Pack", "82.5%", "81.6%"],
              ].map(([name, before, after]) => (
                <div key={name} className="flex items-center justify-between">
                  <span className="text-stone-300">{name}</span>
                  <span className="text-stone-400">
                    {before} → <span className="text-rose-300">{after}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <p className="relative text-xs text-stone-500">Built for home bakeries, food trucks and caterers.</p>
      </aside>

      <main className="flex flex-1 flex-col items-center justify-center px-4 py-12">
        <Link href="/" className="mb-8 md:hidden">
          <Logo />
        </Link>
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-semibold tracking-tight text-stone-900">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-stone-600">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </main>
    </div>
  );
}
