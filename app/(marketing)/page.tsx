import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Logo, LogoMark } from "@/components/marketing/Logo";

// The numbers in the product previews below are the real ones from the
// app's own end-to-end tests (a Sysco invoice, a +16.5% butter move and the
// suggestions computed for it) — no invented stats or testimonials.

function Arrow() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
      <path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function HeroPreview() {
  const impacts: [string, string, string, string][] = [
    ["Butter Croissant", "88.6%", "87.3%", "−1.29"],
    ["Cookie 6-Pack", "82.5%", "81.6%", "−0.87"],
    ["Chocolate Chip Cookie", "85.6%", "84.9%", "−0.71"],
  ];
  return (
    <div className="relative mx-auto w-full max-w-md sm:mb-20">
      <div aria-hidden className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-gradient-to-br from-amber-200/60 via-orange-100/40 to-transparent blur-2xl" />

      <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-xl shadow-stone-900/10">
        <div className="flex items-center justify-between">
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">Price alert</span>
          <span className="text-xs text-stone-400">Sysco · Sep 22</span>
        </div>
        <p className="mt-3 text-lg font-semibold text-stone-900">Unsalted butter went up 16.5%</p>
        <p className="text-sm text-stone-500">$3.40 → $3.96 per lb · 36 lb case at $142.56</p>

        <div className="mt-4 divide-y divide-stone-100 rounded-2xl border border-stone-100">
          {impacts.map(([name, before, after, delta]) => (
            <div key={name} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
              <span className="text-stone-700">{name}</span>
              <span className="flex items-center gap-2 tabular-nums">
                <span className="text-stone-400">{before}</span>
                <span className="text-stone-300">→</span>
                <span className="font-medium text-stone-900">{after}</span>
                <span className="w-12 text-right text-xs font-medium text-rose-600">{delta}pt</span>
              </span>
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-2xl bg-stone-900 p-4 text-sm text-stone-200">
          <p className="text-xs font-semibold tracking-wide text-amber-300 uppercase">What you can do</p>
          <p className="mt-1.5">
            Raise the croissant from $4.50 to <span className="font-semibold text-white">$5.02</span> — or use{" "}
            <span className="font-semibold text-white">2.82 oz less butter</span> per batch.
          </p>
        </div>
      </div>

      <div className="absolute -bottom-20 left-6 hidden w-56 rotate-[-3deg] rounded-2xl border border-stone-200 bg-white p-3 shadow-lg sm:block">
        <p className="text-[11px] font-medium tracking-wide text-stone-400 uppercase">Scanned as</p>
        <p className="font-mono text-xs text-stone-800">BUTTER SWT UNSLTD 36/1#</p>
        <p className="mt-2 text-[11px] font-medium tracking-wide text-stone-400 uppercase">Matched to</p>
        <p className="text-sm font-medium text-stone-900">Unsalted Butter · 87%</p>
      </div>
    </div>
  );
}

const STEPS = [
  {
    n: "1",
    title: "Snap the invoice",
    body: "Take a photo when the delivery arrives, or drop in a stack of emailed PDFs. Every line is read — item, pack size, price.",
    visual: (
      <div className="space-y-1.5 font-mono text-[11px] text-stone-600">
        {["AP FLOUR BLCHD 50# BG   21.48", "EGG LG GR AA LSE 15DZ   48.75", "MILK WHL GAL 4/1        19.36"].map((l) => (
          <div key={l} className="rounded-md bg-stone-100 px-2 py-1">
            {l}
          </div>
        ))}
      </div>
    ),
  },
  {
    n: "2",
    title: "Swipe to confirm",
    body: "Distributor shorthand is matched to your own ingredient list. Confirm or correct with a swipe — it remembers each vendor's wording next time.",
    visual: (
      <div className="flex items-center gap-2 text-xs">
        <span className="flex-1 rounded-lg border border-stone-200 bg-white px-2 py-2 text-stone-500">
          EGG LG GR AA… → <span className="font-medium text-stone-900">Large Eggs</span>
        </span>
        <span className="rounded-full bg-emerald-600 px-3 py-2 font-medium text-white">✓</span>
      </div>
    ),
  },
  {
    n: "3",
    title: "See your margins move",
    body: "Costs flow through your recipes to every menu item. When a price jumps, you see which items it hit, by how much, and your options.",
    visual: (
      <div className="space-y-2">
        {[
          ["Croissant", 87],
          ["6-Pack", 82],
          ["Cookie", 85],
        ].map(([n, v]) => (
          <div key={n} className="flex items-center gap-2 text-[11px] text-stone-500">
            <span className="w-14">{n}</span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-stone-100">
              <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${v}%` }} />
            </span>
            <span className="w-8 text-right tabular-nums">{v}%</span>
          </div>
        ))}
      </div>
    ),
  },
];

const FEATURES = [
  ["Reads real invoices", "Crumpled delivery slips, phone photos and emailed PDFs. Unreadable ones drop into a spreadsheet-style grid instead of disappearing."],
  ["Learns your vendors", "“BUTTER SWT UNSLTD 36/1#” becomes Unsalted Butter once — then matches automatically on every future invoice."],
  ["Costs per pound, not per case", "Pack sizes are read off the print, so a $142.56 case becomes $3.96/lb and your recipe costs stay honest."],
  ["Alerts with the why", "A price move past your threshold shows every menu item it touched, with the margin before and after."],
  ["Options, not just warnings", "Exact price to restore your margin, or how much to trim the portion — plus a plain-English take on which makes sense."],
  ["Market Watch", "USDA wholesale and FAO global prices for eggs, butter, wheat, sugar and more — early context, clearly labelled as such."],
];

export default async function LandingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex min-h-full flex-1 flex-col overflow-x-clip bg-[#fbf7f0] text-stone-900">
      <header className="sticky top-0 z-20 border-b border-stone-900/5 bg-[#fbf7f0]/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/" aria-label="DoughLine home">
            <Logo />
          </Link>
          <nav className="flex items-center gap-1 text-sm sm:gap-4">
            <a href="#how" className="hidden px-2 text-stone-600 hover:text-stone-900 sm:inline">
              How it works
            </a>
            <a href="#features" className="hidden px-2 text-stone-600 hover:text-stone-900 sm:inline">
              Features
            </a>
            {user ? (
              <Link href="/dashboard" className="rounded-full bg-stone-900 px-4 py-2 font-medium text-white hover:bg-stone-800">
                Open dashboard
              </Link>
            ) : (
              <>
                <Link href="/login" className="px-2 font-medium text-stone-700 hover:text-stone-900">
                  Log in
                </Link>
                <Link href="/signup" className="rounded-full bg-stone-900 px-4 py-2 font-medium text-white hover:bg-stone-800">
                  Get started
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto grid max-w-6xl items-center gap-16 px-4 pt-14 pb-24 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pt-20">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-amber-300/70 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-900">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> For home bakeries, food trucks &amp; caterers
            </p>
            <h1 className="mt-5 text-4xl leading-[1.08] font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
              Know what every invoice does to your margins.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-stone-600">
              Snap your supplier invoice. DoughLine reads every line, ties each price to your recipes, and tells you
              which menu items just got less profitable — and exactly what to do about it.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href={user ? "/dashboard" : "/signup"}
                className="inline-flex items-center gap-2 rounded-full bg-stone-900 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-stone-900/20 hover:bg-stone-800"
              >
                {user ? "Open your dashboard" : "Start tracking your margins"} <Arrow />
              </Link>
              {!user && (
                <Link href="/login" className="rounded-full border border-stone-300 bg-white px-6 py-3 text-sm font-semibold text-stone-800 hover:border-stone-400">
                  Log in
                </Link>
              )}
            </div>
            <dl className="mt-10 grid max-w-lg grid-cols-3 gap-4 border-t border-stone-900/10 pt-6 text-sm">
              {[
                ["Photos & PDFs", "read in seconds"],
                ["Every line", "matched to your list"],
                ["Every menu item", "re-costed live"],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="font-semibold text-stone-900">{k}</dt>
                  <dd className="text-stone-500">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
          <HeroPreview />
        </section>

        <section className="border-y border-stone-900/5 bg-white">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 sm:px-6 md:grid-cols-[1fr_1.4fr] md:items-center">
            <h2 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
              Wholesale prices move every week. Your menu board doesn&apos;t.
            </h2>
            <p className="text-lg leading-relaxed text-stone-600">
              A few cents a pound on butter or flour is invisible on one invoice and painful over a season. Most small
              kitchens find out from the bank balance. DoughLine catches it on the invoice — the day it arrives.
            </p>
          </div>
        </section>

        <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
          <p className="text-sm font-semibold tracking-wide text-amber-700 uppercase">How it works</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Three minutes after the delivery truck leaves.</h2>
          <ol className="mt-10 grid gap-5 md:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n} className="flex flex-col rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-stone-900 text-sm font-semibold text-white">{s.n}</span>
                <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-stone-600">{s.body}</p>
                <div className="mt-6 rounded-2xl bg-[#fbf7f0] p-4">{s.visual}</div>
              </li>
            ))}
          </ol>
        </section>

        <section id="features" className="scroll-mt-20 bg-stone-900 text-stone-100">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <p className="text-sm font-semibold tracking-wide text-amber-400 uppercase">What you get</p>
            <h2 className="mt-2 max-w-2xl text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Built for kitchens without a bookkeeper.
            </h2>
            <div className="mt-10 grid gap-px overflow-hidden rounded-3xl border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(([title, body]) => (
                <div key={title} className="bg-stone-900 p-6">
                  <h3 className="font-semibold text-white">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-stone-400">{body}</p>
                </div>
              ))}
            </div>
            <p className="mt-6 text-sm text-stone-500">
              And if the software ever gets in your way: export everything to a spreadsheet, fix it there, import it back.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="relative overflow-hidden rounded-[2rem] bg-amber-400 px-6 py-14 text-center sm:px-12">
            <div aria-hidden className="absolute -top-20 -right-10 h-64 w-64 rounded-full bg-orange-500/30 blur-3xl" />
            <div aria-hidden className="absolute -bottom-24 -left-10 h-64 w-64 rounded-full bg-yellow-200/60 blur-3xl" />
            <LogoMark className="relative mx-auto h-12 w-12" />
            <h2 className="relative mx-auto mt-5 max-w-2xl text-3xl font-semibold tracking-tight text-balance text-stone-900 sm:text-4xl">
              Stop finding out about price hikes from your bank balance.
            </h2>
            <Link
              href={user ? "/dashboard" : "/signup"}
              className="relative mt-8 inline-flex items-center gap-2 rounded-full bg-stone-900 px-6 py-3 text-sm font-semibold text-white hover:bg-stone-800"
            >
              {user ? "Open your dashboard" : "Create your account"} <Arrow />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-stone-900/5">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-stone-500 sm:px-6">
          <Logo />
          <p>Margin tracking for small food businesses.</p>
        </div>
      </footer>
    </div>
  );
}
