"use client";

import { useState } from "react";
import Link from "next/link";
import { EXAMPLES, workExample, type WorkedExample } from "@/lib/industries/examples";
import { INDUSTRIES, type IndustryId } from "@/lib/industries";

const money = (n: number) => `$${n.toFixed(2)}`;
const unitPrice = money;

// One supply price moves → one product's margin, in the app's own
// arithmetic (lib/industries/examples.ts). Tabs switch the example; the
// butter → croissant one is first. Every number is labelled as an example.
export function HeroExample() {
  const [id, setId] = useState(EXAMPLES[0].id);
  const ex = EXAMPLES.find((e) => e.id === id) ?? EXAMPLES[0];
  const r = workExample(ex);
  return (
    <div className="hero-ticker relative w-full max-w-md rotate-[1.5deg] rounded-md border border-white/10 bg-[#14120f]/90 p-5 shadow-[0_40px_120px_-30px_rgba(255,91,31,0.35)] backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-sm border border-[#ece4d6]/30 px-1.5 py-0.5 font-ledger text-[10px] tracking-[0.2em] text-[#ece4d6] uppercase">Example</span>
        <div role="tablist" aria-label="Worked example" className="flex gap-1 rounded-full border border-white/10 p-0.5">
          {EXAMPLES.map((e) => (
            <button
              key={e.id}
              type="button"
              role="tab"
              aria-selected={e.id === ex.id}
              onClick={() => setId(e.id)}
              className={`rounded-full px-2.5 py-1 font-ledger text-[11px] transition-colors ${e.id === ex.id ? "bg-[#ff5b1f] text-[#0c0b09]" : "text-[#a79f92] hover:text-white"}`}
            >
              {e.tab}
            </button>
          ))}
        </div>
      </div>
      <ExampleBody ex={ex} r={r} />
    </div>
  );
}

function ExampleBody({ ex, r }: { ex: WorkedExample; r: ReturnType<typeof workExample> }) {
  const rows: [string, string, string][] = [
    [`${ex.moved.name} per ${ex.moved.unit}`, unitPrice(ex.moved.from), unitPrice(ex.moved.to)],
    [`Cost of one ${ex.product.toLowerCase()}`, money(r.costBefore), money(r.costAfter)],
    ["Margin", `${r.marginBefore.toFixed(2)}%`, `${r.marginAfter.toFixed(2)}%`],
  ];
  return (
    <div role="tabpanel" aria-label={`${ex.product} example`}>
      <p className="mt-4 truncate font-ledger text-[12px] text-[#8f877b]">{ex.invoiceLine}</p>
      <p className="mt-1 text-[14px] text-[#ece4d6]">
        {ex.moved.name} up <span className="text-[#ff5b1f]">{r.priceMovePct}%</span> → your {ex.product.toLowerCase()} sold at {money(ex.price)}
      </p>
      <table className="mt-3 w-full font-ledger text-[13px] tabular-nums">
        <thead>
          <tr className="text-[10px] tracking-[0.15em] text-[#6d665c] uppercase">
            <th className="py-1 text-left font-normal" />
            <th className="py-1 text-right font-normal">before</th>
            <th className="py-1 text-right font-normal">after</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.06]">
          {rows.map(([k, a, b]) => (
            <tr key={k}>
              <td className="py-2 pr-2 font-sans text-[13px] text-[#ece4d6]">{k}</td>
              <td className="py-2 text-right text-[#a79f92]">{a}</td>
              <td className="py-2 text-right text-white">{b}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {r.fixPrice != null && (
        <div className="mt-4 flex items-center justify-between rounded-sm bg-[#ff5b1f]/10 px-3 py-2 font-ledger text-[11px] text-[#ffb08a]">
          <span>Fix: charge {money(r.fixPrice)} to keep {r.marginBefore.toFixed(2)}%</span>
        </div>
      )}
      <p className="mt-3 text-[11px] leading-snug text-[#6d665c]">
        Example numbers{ex.moved.wastePct ? `, with ${ex.moved.wastePct}% waste` : ""}
        {ex.labor ? ` and ${ex.labor.minutes} min of labor` : ""} — the same arithmetic the app runs on your invoices.
      </p>
    </div>
  );
}

// The industries DoughTally is built for, from the industry profiles.
// `enabled` (ENABLED_INDUSTRIES, read on the server) decides "open now" vs
// "waitlist"; food is the first and fullest.
const CARDS: { key: string; title: string; industries: IndustryId[]; href: string; blurb: string }[] = [
  { key: "food", title: "Bakeries & caterers", industries: ["bakery", "caterer", "food_truck"], href: "/food", blurb: "Recipes, menu items and ingredients — butter by the case, flour by the bag, eggs by the dozen." },
  { key: "florist", title: "Florists", industries: ["florist"], href: "/florists", blurb: "" },
  { key: "jewelry", title: "Jewelers", industries: ["jewelry"], href: "/jewelry", blurb: "" },
  { key: "other", title: "Other makers & shops", industries: ["other"], href: "/signup", blurb: "If you buy supplies on invoices and sell what you make from them, the same costing works for you." },
];

// For the site menu and footer: one link per industry card. "Other makers &
// shops" has no page of its own, so it goes to the cards.
export const INDUSTRY_LINKS = CARDS.map((c) => ({ label: c.title, href: c.key === "other" ? "/#industries" : c.href }));

export function IndustriesSection({ enabled }: { enabled: IndustryId[] }) {
  return (
    <section id="industries" aria-labelledby="industries-title" className="relative scroll-mt-16 border-t border-white/10">
      <div className="mx-auto max-w-[1400px] px-4 py-20 sm:px-8 sm:py-24">
        <p className="font-ledger text-[11px] tracking-[0.25em] text-[#ff5b1f] uppercase">Industries</p>
        <h2 id="industries-title" className="mt-4 max-w-[22ch] font-display text-4xl leading-[0.98] font-bold tracking-[-0.035em] text-white sm:text-5xl">
          Built for businesses that make what they sell.
        </h2>
        <ul className="mt-12 grid gap-px overflow-hidden rounded-md border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
          {CARDS.map((c) => {
            const p = INDUSTRIES[c.industries[0]];
            const open = c.key === "other" || c.industries.some((i) => enabled.includes(i));
            const v = p.vocab;
            return (
              <li key={c.key} className="flex flex-col bg-[#0c0b09] p-6">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-display text-xl font-semibold tracking-tight text-white">{c.title}</h3>
                  <span className={`shrink-0 rounded-sm px-1.5 py-0.5 font-ledger text-[10px] tracking-[0.15em] uppercase ${open ? "bg-[#ff5b1f] text-[#0c0b09]" : "border border-white/20 text-[#a79f92]"}`}>
                    {open ? "Open now" : "Waitlist"}
                  </span>
                </div>
                <p className="mt-3 flex-1 text-[15px] leading-relaxed text-[#a79f92]">{c.blurb || p.description}</p>
                {c.key !== "other" && (
                  <p className="mt-4 font-ledger text-[11px] text-[#8f877b]">
                    {v.ingredients} → {v.recipes} → {v.menuItems}
                    <span className="block">by {p.units.slice(0, 4).join(", ")}</span>
                  </p>
                )}
                <Link href={c.href} className="mt-5 inline-flex items-center gap-1.5 text-[14px] font-medium text-white underline decoration-[#ff5b1f] underline-offset-4">
                  {c.key === "other" ? "Create an account" : open ? `DoughTally for ${c.title.toLowerCase()}` : "See what's coming"}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
