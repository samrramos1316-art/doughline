import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Logo, LogoMark } from "@/components/marketing/Logo";
import { ArrowRight, BrowserFrame, Check, Eyebrow, PhoneFrame } from "@/components/landing/primitives";
import { AlertMock, DashboardMock, GridMock, InvoiceReadMock, MarketMock, SwipeMock } from "@/components/landing/mockups";

const NAV = [
  ["Product", "#product"],
  ["How it works", "#how"],
  ["The numbers", "#numbers"],
  ["FAQ", "#faq"],
];

const TOUR = [
  {
    id: "read",
    step: "01 — Read",
    title: "Reads the invoice, not just the photo.",
    body: "Snap the delivery slip on your phone or drop in a stack of emailed PDFs. Every line comes back with what it actually is, how much was in the case, and what that works out to per pound, per dozen, per gallon.",
    points: ["Distributor shorthand expanded — “BUTTER SWT UNSLTD 36/1#” is unsalted butter", "Pack sizes read off the print, so a $142.56 case becomes $3.96/lb", "Blurry or unreadable? It lands in a grid for you to type, never lost"],
    mock: <InvoiceReadMock />,
    frame: "none" as const,
  },
  {
    id: "confirm",
    step: "02 — Confirm",
    title: "You stay in charge of every match.",
    body: "Sure matches go straight through. Anything uncertain becomes a card — swipe right to confirm, left for the next suggestion, or add it as a new ingredient. Confirm a vendor's wording once and it's recognised on every future invoice.",
    points: ["Confidence shown on every suggestion — nothing guessed silently", "Remembers each supplier's phrasing after one confirmation", "A review queue that won't let unchecked costs pile up"],
    mock: <SwipeMock />,
    frame: "phone" as const,
  },
  {
    id: "alert",
    step: "03 — Understand",
    title: "Price changes, explained in menu items.",
    body: "When a confirmed price moves past your threshold, DoughTally traces it through every recipe to every menu item — margin before, margin after — then works out your options: the exact price that restores the margin, or how much to trim the portion.",
    points: ["Before/after margins recorded the moment the price changed", "Deterministic options you can check by hand", "A short, plain-English take on which option fits the item"],
    mock: <AlertMock />,
    frame: "browser" as const,
    url: "doughtally · alerts",
  },
  {
    id: "market",
    step: "04 — Look ahead",
    title: "See the market before it reaches your invoice.",
    body: "Daily USDA wholesale prices for eggs, butter and wheat, plus the FAO's global indexes for dairy, cereals, sugar, oils and meat — linked to the ingredients you actually buy, and clearly labelled as context rather than a forecast.",
    points: ["Pulled automatically every day from USDA and the FAO", "Tied to your own ingredient list, so only relevant moves surface", "Kept visually separate from alerts about your real invoices"],
    mock: <MarketMock />,
    frame: "browser" as const,
    url: "doughtally · market watch",
  },
  {
    id: "grid",
    step: "05 — Take control",
    title: "And a spreadsheet, whenever you want one.",
    body: "Type an invoice by hand, paste rows straight from Excel, bulk-edit your ingredient list, or export everything to CSV and bring it back. The app is never the only way to see or fix your data.",
    points: ["Tab, Enter and paste work like a real spreadsheet", "Typos caught inline — the line total has to add up", "Import past invoices in bulk to build your price history"],
    mock: <GridMock />,
    frame: "browser" as const,
    url: "doughtally · enter invoice lines",
  },
];

const CHAIN = [
  { label: "Invoice line", value: "$142.56", detail: "BUTTER SWT UNSLTD 36/1# — one 36 lb case" },
  { label: "Ingredient cost", value: "$3.96/lb", detail: "$142.56 ÷ 36 lb · up 16.5% from $3.40" },
  { label: "Recipe", value: "$0.5694", detail: "per croissant · 1.25 lb butter in a batch of 12" },
  { label: "Menu item", value: "87.35%", detail: "margin at $4.50 · was 88.64% before this invoice" },
];

const FAQ = [
  ["What kinds of invoices can it read?", "Phone photos of printed invoices and packing slips, and PDF invoices from email — one at a time from the scan screen, or up to 25 at once with bulk import. If a photo is too blurry to read, the invoice is marked as such and opens in a spreadsheet-style grid so you can type it in."],
  ["What happens when it misreads something?", "Nothing uncertain changes your costs on its own. Low-confidence matches wait in a review queue for you to confirm or correct, and you can edit any line afterwards. Once you've confirmed how a supplier words an item, it's matched automatically from then on."],
  ["Do I need to set up recipes first?", "No. Scanning works from day one and builds your price history. Add recipes and menu items — typed, pasted, or imported from a spreadsheet — whenever you're ready, and margins start calculating from your latest costs immediately."],
  ["Where does the market data come from?", "The USDA's Agricultural Marketing Service (daily wholesale egg, butter and wheat prices) and the UN Food and Agriculture Organization's Food Price Index. It's shown as directional context — wholesale markets don't move exactly like your distributor's prices."],
  ["Can I get my data out?", "Yes, any time. Export your full ingredient list and costs as a CSV, edit it in any spreadsheet, and import it back. Old invoices can be imported in bulk to build history without changing today's costs."],
  ["Who can see my numbers?", "Only your account. Every row in the database is scoped to your business and enforced by the database itself, not just the app."],
];

export default async function LandingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const appHref = user ? "/dashboard" : "/login";

  return (
    <div className="flex min-h-full flex-1 flex-col overflow-x-clip bg-[#faf7f2] text-stone-900 selection:bg-amber-200">
      {/* ---------------------------------------------------------------- nav */}
      <header className="sticky top-0 z-30 border-b border-stone-900/[0.06] bg-[#faf7f2]/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3 sm:px-8">
          <Link href="/" aria-label="DoughTally home">
            <Logo />
          </Link>
          <nav aria-label="Sections" className="hidden items-center gap-7 text-[13px] text-stone-600 md:flex">
            {NAV.map(([label, href]) => (
              <a key={href} href={href} className="transition hover:text-stone-900">
                {label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Link
              href={appHref}
              className="group inline-flex items-center gap-1.5 rounded-full border border-stone-900/15 bg-white px-4 py-2 text-[13px] font-medium text-stone-900 shadow-sm transition hover:border-stone-900/30"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
              {user ? "Open app" : "Log in"}
              <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
            </Link>
            {!user && (
              <Link href="/signup" className="hidden rounded-full bg-stone-900 px-4 py-2 text-[13px] font-medium text-white transition hover:bg-stone-800 sm:inline-flex">
                Get started
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* --------------------------------------------------------------- hero */}
        <section className="relative">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[640px] bg-[radial-gradient(60%_60%_at_50%_0%,rgba(251,191,36,0.22),transparent_70%)]" />
          <div className="relative mx-auto max-w-6xl px-5 pt-16 text-center sm:px-8 sm:pt-24">
            <p className="inline-flex items-center gap-2 rounded-full bg-white/70 px-3.5 py-1.5 text-xs font-medium text-stone-700 ring-1 ring-stone-900/10 backdrop-blur">
              <LogoMark className="h-4 w-4" />
              <span className="sm:hidden">For bakeries, food trucks &amp; caterers</span>
              <span className="hidden sm:inline">Margin tracking for home bakeries, food trucks &amp; caterers</span>
            </p>
            <h1 className="mx-auto mt-7 max-w-4xl font-serif text-[2.9rem] leading-[1.02] text-balance sm:text-7xl lg:text-[5.5rem]">
              Every invoice, <em className="text-amber-700">traced</em> to your menu.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-[17px] leading-relaxed text-stone-600 sm:text-lg">
              DoughTally reads your supplier invoices, keeps every ingredient cost current, and shows exactly how each
              price change moves the margin on every item you sell — with clear options for what to do next.
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Link
                href={user ? "/dashboard" : "/signup"}
                className="group inline-flex items-center gap-2 rounded-full bg-stone-900 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-stone-900/20 transition hover:bg-stone-800"
              >
                {user ? "Open your dashboard" : "Start tracking your margins"}
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </Link>
              <a href="#product" className="rounded-full px-5 py-3.5 text-sm font-semibold text-stone-700 transition hover:text-stone-900">
                See how it works ↓
              </a>
            </div>
            <p className="mt-5 text-xs text-stone-500">Works on your phone at the delivery door · Photos or PDFs · Export anytime</p>
          </div>

          <div className="relative mx-auto mt-16 max-w-5xl px-5 pb-24 sm:px-8">
            <BrowserFrame url="doughtally · dashboard">
              <DashboardMock />
            </BrowserFrame>
            <div className="absolute -top-8 right-4 hidden w-60 rotate-[2deg] rounded-2xl bg-stone-900 p-4 text-left text-stone-100 shadow-2xl lg:block xl:-right-10">
              <p className="text-[10px] font-semibold tracking-wide text-amber-400 uppercase">Just scanned</p>
              <p className="mt-1 text-sm font-medium text-white">8 lines read from Sysco</p>
              <p className="mt-0.5 text-xs text-stone-400">3 matched automatically · 5 to confirm</p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full w-[38%] rounded-full bg-amber-400" />
              </div>
            </div>
            <div className="absolute bottom-10 -left-2 hidden w-64 rotate-[-2deg] rounded-2xl bg-white p-4 text-left shadow-2xl ring-1 ring-stone-900/5 lg:block xl:-left-16">
              <p className="text-[10px] font-semibold tracking-wide text-stone-400 uppercase">What you can do</p>
              <p className="mt-1 text-[13px] leading-snug text-stone-700">
                Croissant: raise to <span className="font-semibold text-stone-900">$5.02</span>, or use{" "}
                <span className="font-semibold text-stone-900">2.82 oz less butter</span> per batch.
              </p>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------ made for */}
        <section aria-label="Who it's for" className="border-y border-stone-900/[0.06] bg-white/60">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-10 gap-y-3 px-5 py-6 text-sm text-stone-500 sm:px-8">
            <span className="text-xs font-semibold tracking-[0.18em] text-stone-400 uppercase">Made for</span>
            {["Home bakeries", "Food trucks", "Caterers", "Cafés & coffee carts", "Market stalls"].map((w) => (
              <span key={w} className="font-serif text-xl text-stone-700 italic">
                {w}
              </span>
            ))}
          </div>
        </section>

        {/* ------------------------------------------------------------- problem */}
        <section className="mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
          <div className="grid gap-14 lg:grid-cols-[1fr_1.15fr] lg:items-center">
            <div>
              <Eyebrow>The problem</Eyebrow>
              <h2 className="mt-4 font-serif text-4xl leading-[1.05] text-balance sm:text-5xl">
                A case of butter went up $20. Would you have noticed?
              </h2>
              <p className="mt-6 text-lg leading-relaxed text-stone-600">
                Wholesale prices move every week; menu prices move a few times a year. The gap between them is invisible
                on any single invoice — and it&apos;s where small food businesses quietly lose their margin.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-3xl border border-stone-900/[0.07] bg-white p-6">
                <p className="text-xs font-semibold tracking-wide text-stone-400 uppercase">Without DoughTally</p>
                <ol className="mt-5 space-y-5 text-sm">
                  {[
                    ["Monday", "Invoice goes in the folder with the others."],
                    ["Every day", "Croissants sell at $4.50, costing 5.8¢ more each than last month."],
                    ["Month end", "Margins are down and nobody can say which item, or why."],
                  ].map(([when, what]) => (
                    <li key={when} className="flex gap-3">
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-stone-300" />
                      <span>
                        <span className="block font-medium text-stone-900">{when}</span>
                        <span className="text-stone-500">{what}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
              <div className="rounded-3xl bg-stone-900 p-6 text-stone-100 shadow-xl">
                <p className="text-xs font-semibold tracking-wide text-amber-400 uppercase">With DoughTally</p>
                <ol className="mt-5 space-y-5 text-sm">
                  {[
                    ["Monday, at delivery", "Invoice scanned; 8 lines read and costed per pound."],
                    ["Seconds later", "Butter +16.5% flagged, traced to the 3 menu items that use it."],
                    ["Same morning", "Decide: $5.02 croissants, or 2.82 oz less butter a batch — or absorb it."],
                  ].map(([when, what]) => (
                    <li key={when} className="flex gap-3">
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amber-400" />
                      <span>
                        <span className="block font-medium text-white">{when}</span>
                        <span className="text-stone-400">{what}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------- product tour */}
        <section id="product" className="scroll-mt-20 border-t border-stone-900/[0.06] bg-white">
          <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
            <div className="mx-auto max-w-2xl text-center">
              <Eyebrow>The product</Eyebrow>
              <h2 className="mt-4 font-serif text-4xl leading-[1.05] text-balance sm:text-6xl">
                From the delivery door to the menu board.
              </h2>
              <p className="mt-5 text-lg text-stone-600">Five things DoughTally does, each one built for a kitchen without a bookkeeper.</p>
            </div>

            <div className="mt-20 space-y-28 sm:space-y-36">
              {TOUR.map((t, i) => (
                <article key={t.id} className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
                  <div className={i % 2 ? "lg:order-2" : ""}>
                    <p className="font-mono text-xs tracking-wide text-amber-700">{t.step}</p>
                    <h3 className="mt-3 font-serif text-3xl leading-[1.08] text-balance sm:text-[2.6rem]">{t.title}</h3>
                    <p className="mt-5 text-[16px] leading-relaxed text-stone-600">{t.body}</p>
                    <ul className="mt-7 space-y-3">
                      {t.points.map((p) => (
                        <li key={p} className="flex gap-3 text-[15px] text-stone-700">
                          <Check className="mt-0.5 h-4 w-4 shrink-0" />
                          {p}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className={`relative ${i % 2 ? "lg:order-1" : ""}`}>
                    <div aria-hidden className="absolute -inset-6 rounded-[2.5rem] bg-gradient-to-br from-amber-100/80 via-[#faf7f2] to-stone-100 sm:-inset-10" />
                    <div className="relative">
                      {t.frame === "phone" ? (
                        <PhoneFrame>{t.mock}</PhoneFrame>
                      ) : t.frame === "browser" ? (
                        <BrowserFrame url={t.url ?? "doughtally"}>{t.mock}</BrowserFrame>
                      ) : (
                        t.mock
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------- how it works */}
        <section id="how" className="scroll-mt-20 bg-[#faf7f2]">
          <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-28">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <Eyebrow>Getting started</Eyebrow>
                <h2 className="mt-4 font-serif text-4xl sm:text-5xl">Set up in an afternoon.</h2>
              </div>
              <p className="max-w-md text-stone-600">No accountant, no integrations, no card. If you already keep a spreadsheet, you can paste it straight in.</p>
            </div>
            <ol className="mt-12 grid gap-px overflow-hidden rounded-3xl border border-stone-900/[0.07] bg-stone-900/[0.07] md:grid-cols-3">
              {[
                ["Add your ingredients", "Type them, paste them, or import a CSV. Costs are optional — your first invoice fills them in."],
                ["Build recipes & menu", "List what goes into each batch and what you sell it for. Margins calculate instantly."],
                ["Scan every delivery", "Photo or PDF. Costs, alerts and suggestions update on their own from then on."],
              ].map(([title, body], i) => (
                <li key={title} className="bg-white p-8">
                  <span className="font-serif text-5xl text-amber-600 italic">{i + 1}</span>
                  <h3 className="mt-4 text-lg font-semibold">{title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-stone-600">{body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* --------------------------------------------------------- the numbers */}
        <section id="numbers" className="scroll-mt-20 bg-stone-900 text-stone-100">
          <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
            <div className="max-w-2xl">
              <Eyebrow dark>The numbers</Eyebrow>
              <h2 className="mt-4 font-serif text-4xl leading-[1.05] text-white sm:text-6xl">
                Every figure, <em className="text-amber-400">traceable.</em>
              </h2>
              <p className="mt-5 text-lg text-stone-400">
                No black box. Here&apos;s one real invoice line followed all the way to one menu item&apos;s margin — every
                step is plain arithmetic you could check with a calculator.
              </p>
            </div>
            <ol className="mt-14 grid gap-4 md:grid-cols-4">
              {CHAIN.map((c, i) => (
                <li key={c.label} className="relative rounded-2xl border border-white/10 bg-white/[0.04] p-6">
                  <p className="font-mono text-[11px] tracking-wide text-stone-500 uppercase">
                    {String(i + 1).padStart(2, "0")} · {c.label}
                  </p>
                  <p className="mt-4 font-serif text-4xl text-white tabular-nums">{c.value}</p>
                  <p className="mt-3 text-sm leading-relaxed text-stone-400">{c.detail}</p>
                  {i < CHAIN.length - 1 && (
                    <span aria-hidden className="absolute top-1/2 -right-3.5 z-10 hidden h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-amber-400 text-stone-900 md:flex">
                      <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  )}
                </li>
              ))}
            </ol>
            <div className="mt-14 grid gap-8 border-t border-white/10 pt-12 md:grid-cols-3">
              {[
                ["You confirm, it learns", "Uncertain matches always wait for you. Each confirmation teaches it that supplier's wording for good."],
                ["Context, not predictions", "Market data is labelled as direction, never dressed up as a forecast of your next invoice."],
                ["Your data stays yours", "Private to your business at the database level, and exportable to a spreadsheet at any time."],
              ].map(([title, body]) => (
                <div key={title}>
                  <h3 className="font-semibold text-white">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-stone-400">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------------ faq */}
        <section id="faq" className="scroll-mt-20 bg-white">
          <div className="mx-auto grid max-w-6xl gap-12 px-5 py-24 sm:px-8 sm:py-28 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <Eyebrow>Questions</Eyebrow>
              <h2 className="mt-4 font-serif text-4xl sm:text-5xl">Good to know.</h2>
              <p className="mt-4 text-stone-600">
                Something else?{" "}
                <Link href={appHref} className="font-medium text-stone-900 underline">
                  {user ? "Open the app" : "Log in"}
                </Link>{" "}
                and look around — everything here is in the product today.
              </p>
            </div>
            <div className="divide-y divide-stone-900/[0.08] border-y border-stone-900/[0.08]">
              {FAQ.map(([q, a]) => (
                <details key={q} className="group py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-[17px] font-medium text-stone-900 [&::-webkit-details-marker]:hidden">
                    {q}
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-1 ring-stone-900/15 transition group-open:rotate-45" aria-hidden>
                      +
                    </span>
                  </summary>
                  <p className="mt-3 max-w-2xl pr-10 text-[15px] leading-relaxed text-stone-600">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------------ cta */}
        <section className="px-5 pb-24 sm:px-8">
          <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[2.5rem] bg-amber-400 px-6 py-20 text-center sm:px-16">
            <div aria-hidden className="absolute -top-24 -right-16 h-80 w-80 rounded-full bg-orange-500/30 blur-3xl" />
            <div aria-hidden className="absolute -bottom-28 -left-16 h-80 w-80 rounded-full bg-yellow-100/70 blur-3xl" />
            <h2 className="relative mx-auto max-w-3xl font-serif text-4xl leading-[1.05] text-balance text-stone-900 sm:text-6xl">
              Stop finding out about price hikes from your bank balance.
            </h2>
            <div className="relative mt-10 flex flex-wrap justify-center gap-3">
              <Link
                href={user ? "/dashboard" : "/signup"}
                className="group inline-flex items-center gap-2 rounded-full bg-stone-900 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-stone-800"
              >
                {user ? "Open your dashboard" : "Create your account"}
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </Link>
              {!user && (
                <Link href="/login" className="rounded-full bg-white/60 px-6 py-3.5 text-sm font-semibold text-stone-900 ring-1 ring-stone-900/10 transition hover:bg-white">
                  Log in
                </Link>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* --------------------------------------------------------------- footer */}
      <footer className="border-t border-stone-900/[0.06]">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-12 text-sm sm:px-8 md:grid-cols-[1.5fr_1fr_1fr]">
          <div>
            <Logo />
            <p className="mt-3 max-w-xs text-stone-500">Invoice-to-menu margin tracking for small food businesses.</p>
          </div>
          <div>
            <p className="font-semibold text-stone-900">Product</p>
            <ul className="mt-3 space-y-2 text-stone-500">
              {NAV.map(([label, href]) => (
                <li key={href}>
                  <a href={href} className="hover:text-stone-900">
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-semibold text-stone-900">Account</p>
            <ul className="mt-3 space-y-2 text-stone-500">
              {(user
                ? [["Open app", "/dashboard"]]
                : [
                    ["Log in", "/login"],
                    ["Create an account", "/signup"],
                  ]
              ).map(([label, href]) => (
                <li key={href}>
                  <Link href={href} className="hover:text-stone-900">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="border-t border-stone-900/[0.06] py-6 text-center text-xs text-stone-400">© 2026 DoughTally</p>
      </footer>
    </div>
  );
}
