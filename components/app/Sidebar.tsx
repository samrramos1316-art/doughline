"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoMark } from "@/components/marketing/Logo";

export type NavCounts = { review: number; alerts: number; failed: number; reviewBlocked: boolean };

type Item = { href: string; label: string; icon: keyof typeof ICONS; badge?: (c: NavCounts) => { n: number; tone: "red" | "amber" } | null };
const GROUPS: { label: string; items: Item[] }[] = [
  { label: "", items: [{ href: "/dashboard", label: "Overview", icon: "grid" }] },
  {
    label: "Kitchen",
    items: [
      { href: "/menu", label: "Menu & margins", icon: "tag" },
      { href: "/recipes", label: "Recipes", icon: "book" },
      { href: "/ingredients", label: "Ingredients", icon: "box" },
    ],
  },
  {
    label: "Purchasing",
    items: [
      { href: "/invoices", label: "Invoices", icon: "doc", badge: (c) => (c.failed ? { n: c.failed, tone: "amber" } : null) },
      { href: "/review", label: "Review", icon: "check", badge: (c) => (c.review ? { n: c.review, tone: c.reviewBlocked ? "red" : "amber" } : null) },
      { href: "/alerts", label: "Price alerts", icon: "bell", badge: (c) => (c.alerts ? { n: c.alerts, tone: "red" } : null) },
    ],
  },
  { label: "Insight", items: [{ href: "/market", label: "Market watch", icon: "chart" }] },
  { label: "Business", items: [{ href: "/settings", label: "Settings", icon: "cog" }] },
];

const ICONS = {
  grid: "M3 3h6v6H3zM11 3h6v6h-6zM3 11h6v6H3zM11 11h6v6h-6z",
  tag: "M3 10V3h7l7 7-7 7-7-7zM6.5 6.5h.01",
  book: "M4 3h9a2 2 0 0 1 2 2v12H6a2 2 0 0 1-2-2zM4 15a2 2 0 0 1 2-2h9",
  box: "M3 6l7-3 7 3v8l-7 3-7-3zM3 6l7 3 7-3M10 9v8",
  doc: "M5 2h7l4 4v12H5zM12 2v4h4M8 10h5M8 13h5",
  check: "M4 10l4 4 8-8",
  bell: "M10 3a5 5 0 0 0-5 5v3l-2 3h14l-2-3V8a5 5 0 0 0-5-5zM8 17a2 2 0 0 0 4 0",
  chart: "M3 16l4-5 3 3 6-8M3 3v14h14",
  cog: "M10 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM10 1.5v2.5M10 16v2.5M1.5 10H4M16 10h2.5M4 4l1.8 1.8M14.2 14.2 16 16M4 16l1.8-1.8M14.2 5.8 16 4",
} as const;

function Icon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0" aria-hidden>
      <path d={ICONS[name]} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const isActive = (path: string, href: string) => path === href || path.startsWith(`${href}/`);

function Badge({ n, tone }: { n: number; tone: "red" | "amber" }) {
  return (
    <span className={`ml-auto rounded px-1.5 text-[11px] font-semibold tabular-nums ${tone === "red" ? "bg-red-500 text-white" : "bg-amber-400 text-stone-900"}`}>
      {n}
    </span>
  );
}

// Desktop: a fixed dark rail with every section and its live counts.
export function Sidebar({ business, owner, counts, logOut }: { business: string; owner: string | null; counts: NavCounts; logOut: React.ReactNode }) {
  const path = usePathname();
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col bg-[#1a1714] text-stone-300 lg:flex">
      <Link href="/dashboard" className="flex items-center gap-2.5 border-b border-white/5 px-4 py-4">
        <LogoMark className="h-8 w-8" />
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-white">{business}</span>
          <span className="block text-[11px] tracking-wider text-stone-500 uppercase">DoughLine</span>
        </span>
      </Link>
      <nav aria-label="Main" className="flex-1 overflow-y-auto px-2 py-3">
        {GROUPS.map((g) => (
          <div key={g.label || "top"} className="mb-3">
            {g.label && <p className="px-2 pb-1 text-[10px] font-semibold tracking-[0.16em] text-stone-500 uppercase">{g.label}</p>}
            {g.items.map((it) => {
              const active = isActive(path, it.href);
              const badge = it.badge?.(counts);
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm ${
                    active ? "bg-white/10 font-medium text-white" : "hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {active && <span aria-hidden className="absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded bg-amber-400" />}
                  <Icon name={it.icon} />
                  {it.label}
                  {badge && <Badge {...badge} />}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="border-t border-white/5 p-3">
        <Link href="/invoices/scan" className="flex items-center justify-center gap-2 rounded-md bg-amber-400 px-3 py-2 text-sm font-semibold text-stone-900 hover:bg-amber-300">
          <CameraIcon /> Scan an invoice
        </Link>
        <div className="mt-3 flex items-center justify-between gap-2 px-1 text-xs">
          <span className="truncate text-stone-400">{owner ?? "Signed in"}</span>
          {logOut}
        </div>
      </div>
    </aside>
  );
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path d="M4 8a2 2 0 0 1 2-2h1.2a1 1 0 0 0 .8-.4l1-1.3A1 1 0 0 1 9.8 4h4.4a1 1 0 0 1 .8.3l1 1.3a1 1 0 0 0 .8.4H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Z" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="13" r="3.5" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

// Phones: a dark top bar and every section as a scrolling tab strip.
export function MobileNav({ business, counts }: { business: string; counts: NavCounts }) {
  const path = usePathname();
  const items = GROUPS.flatMap((g) => g.items);
  return (
    <div className="sticky top-0 z-30 bg-[#1a1714] text-stone-300 lg:hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5">
        <Link href="/dashboard" className="flex min-w-0 items-center gap-2">
          <LogoMark className="h-7 w-7" />
          <span className="truncate text-sm font-semibold text-white">{business}</span>
        </Link>
        <Link href="/invoices/scan" className="flex shrink-0 items-center gap-1.5 rounded-md bg-amber-400 px-2.5 py-1.5 text-xs font-semibold text-stone-900">
          <CameraIcon /> Scan
        </Link>
      </div>
      <nav aria-label="Sections" className="flex gap-1 overflow-x-auto px-2 pb-2">
        {items.map((it) => {
          const active = isActive(path, it.href);
          const badge = it.badge?.(counts);
          return (
            <Link
              key={it.href}
              href={it.href}
              aria-current={active ? "page" : undefined}
              className={`flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium whitespace-nowrap ${active ? "bg-white/15 text-white" : "text-stone-400"}`}
            >
              {it.label}
              {badge && <Badge {...badge} />}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
