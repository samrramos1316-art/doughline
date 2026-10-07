import Link from "next/link";
import { LogoMark } from "@/components/marketing/Logo";
import { INDUSTRIES, type IndustryId } from "@/lib/industries";
import { isIndustryEnabled } from "@/lib/industries/gate";
import { exampleFor, workExample } from "@/lib/industries/examples";
import { lower } from "@/lib/vocab";
import { CONTACT_EMAIL } from "@/lib/legal";

const money = (n: number) => `$${n.toFixed(2)}`;
const label = (category: string) => category.replace(/_/g, " ");

// A page per industry (/florists, /jewelry), built from its profile in
// lib/industries: its words, units, categories, defaults and a worked
// example. Industries not in ENABLED_INDUSTRIES get the waitlist version —
// there's no signup link for them, only a way to ask to be told.
export function IndustryPage({ id, audience }: { id: IndustryId; audience: string }) {
  const p = INDUSTRIES[id];
  const v = p.vocab;
  const open = isIndustryEnabled(id);
  const ex = exampleFor(id);
  const r = ex ? workExample(ex) : null;
  const waitlist = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`DoughTally for ${audience} — waitlist`)}`;

  return (
    <div className="flex min-h-full flex-1 flex-col bg-[#0c0b09] font-body text-[#cfc6b7] selection:bg-[#ff5b1f] selection:text-[#0c0b09]">
      <header className="border-b border-white/[0.07]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5" aria-label="DoughTally Software home">
            <LogoMark className="h-8 w-8" />
            <span className="font-display text-[18px] font-bold tracking-tight text-white">DoughTally</span>
          </Link>
          <nav className="flex items-center gap-4 text-[13px]">
            <Link href="/#industries" className="text-[#a79f92] hover:text-white">Industries</Link>
            <Link href="/login" className="rounded-full border border-white/15 px-3.5 py-1.5 text-white hover:border-white/40">Log in</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-14 sm:px-8 sm:py-20">
        <p className="font-ledger text-[11px] tracking-[0.25em] text-[#ff5b1f] uppercase">For {audience}</p>
        <h1 className="mt-3 max-w-[20ch] font-display text-4xl font-bold tracking-[-0.03em] text-white sm:text-6xl">
          Know what every {lower(v.recipe)} really costs you.
        </h1>
        <p className="mt-6 max-w-2xl text-[18px] leading-relaxed text-[#b5ad9f]">
          Snap a photo of a supplier invoice. Your {lower(v.ingredient)} costs update, every {lower(v.recipe)} is re-costed — waste and labor included — and you see which {lower(v.menuItems)} just got less profitable.
        </p>

        {open ? (
          <Link href={`/signup?industry=${id}`} className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#ff5b1f] px-7 py-4 text-[15px] font-semibold text-[#0c0b09] hover:bg-[#ff7a45]">
            Create your account
          </Link>
        ) : (
          <div className="mt-8 max-w-2xl rounded-md border border-white/15 bg-white/[0.03] p-5" data-testid="waitlist">
            <p className="font-ledger text-[11px] tracking-[0.2em] text-[#ff5b1f] uppercase">Waitlist</p>
            <p className="mt-2 text-[16px] text-white">DoughTally isn&apos;t open to {audience} yet.</p>
            <p className="mt-1 text-[15px] text-[#a79f92]">
              We&apos;re shaping it with a few {audience} first. Want to hear when it opens?{" "}
              <a href={waitlist} className="text-white underline decoration-[#ff5b1f] underline-offset-4">Email {CONTACT_EMAIL}</a> and we&apos;ll tell you.
            </p>
          </div>
        )}

        <div className="mt-16 grid gap-10 lg:grid-cols-2">
          {ex && r && (
            <section aria-labelledby="example-title" className="rounded-md border border-white/10 bg-[#14120f] p-6">
              <div className="flex items-center justify-between">
                <h2 id="example-title" className="font-display text-xl font-semibold text-white">One price move, worked through</h2>
                <span className="rounded-sm border border-[#ece4d6]/30 px-1.5 py-0.5 font-ledger text-[10px] tracking-[0.2em] text-[#ece4d6] uppercase">Example</span>
              </div>
              <p className="mt-3 font-ledger text-[12px] text-[#8f877b]">{ex.invoiceLine}</p>
              <dl className="mt-4 divide-y divide-white/[0.06] text-[15px]">
                {[
                  [`${ex.moved.name}, per ${ex.moved.unit}`, `${money(ex.moved.from)} → ${money(ex.moved.to)} (+${r.priceMovePct}%)`],
                  [`In one ${ex.product.toLowerCase()}`, `${ex.moved.qty} ${ex.moved.unit}${ex.moved.wastePct ? ` + ${ex.moved.wastePct}% waste` : ""}${ex.labor ? `, ${ex.labor.minutes} min labor at ${money(ex.labor.ratePerHour)}/h` : ""}`],
                  ["Cost of one", `${money(r.costBefore)} → ${money(r.costAfter)}`],
                  [`Margin at ${money(ex.price)}`, `${r.marginBefore.toFixed(2)}% → ${r.marginAfter.toFixed(2)}%`],
                  ...(r.fixPrice != null ? [["To keep the old margin", `charge ${money(r.fixPrice)}`]] : []),
                ].map(([k, val]) => (
                  <div key={k} className="flex flex-wrap justify-between gap-x-6 gap-y-1 py-2.5">
                    <dt className="text-[#a79f92]">{k}</dt>
                    <dd className="font-ledger text-white tabular-nums">{val}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-4 text-[12px] text-[#6d665c]">Example numbers, not market prices — the same arithmetic the app runs on your invoices.</p>
            </section>
          )}

          <section aria-labelledby="fit-title">
            <h2 id="fit-title" className="font-display text-xl font-semibold text-white">Set up the way you work</h2>
            <ul className="mt-4 space-y-3 text-[15px] leading-relaxed">
              <li><b className="text-white">{v.ingredients}</b>, priced from your invoices, by {p.units.join(", ")}.</li>
              <li><b className="text-white">{v.recipes}</b> list what goes into each piece, with a waste % per line (new lines start at {p.defaults.default_waste_pct}%) and labor time.</li>
              <li><b className="text-white">{v.menuItems}</b> carry your selling price, so every margin stays current.</li>
              <li>Suggested categories: {p.categories.map(label).join(", ")}.</li>
            </ul>
            <h2 className="mt-10 font-display text-xl font-semibold text-white">Not there yet</h2>
            <ul className="mt-4 space-y-2 text-[15px] text-[#a79f92]">
              <li>No market-price feed for {audience}&apos; supplies — the Market Watch prices are food commodities only.</li>
              <li>No connections to supplier portals or point-of-sale systems: invoices come in as photos or PDFs.</li>
            </ul>
          </section>
        </div>
      </main>

      <footer className="border-t border-white/10 py-6 text-center font-ledger text-[11px] tracking-wider text-[#6d665c]">
        <span>© 2026 DoughTally Software · </span>
        <Link href="/privacy" className="hover:text-white">Privacy</Link> · <Link href="/terms" className="hover:text-white">Terms</Link> · <Link href="/cookies" className="hover:text-white">Cookies</Link>
      </footer>
    </div>
  );
}
