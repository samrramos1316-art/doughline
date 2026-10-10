import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getIndustry } from "@/lib/supabase/vocab";
import { eventQuote } from "@/lib/costing/quote";
import { lower } from "@/lib/vocab";
import { SheetBar } from "@/components/print/SheetBar";
import { Today } from "@/components/print/Today";

export const metadata: Metadata = { title: "Event quote" };

type Params = { name?: string; items?: string; delivery?: string; setup_minutes?: string; rate?: string; other?: string; target?: string; price?: string };

const money = (n: number | null | undefined) => (n == null ? "—" : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const num = (s: string | undefined) => (s == null || s.trim() === "" || !Number.isFinite(Number(s)) ? null : Number(s));
const td = "border-b border-stone-100 px-2 py-1.5 text-[13px]";
const tdR = `${td} text-right tabular-nums`;
const th = "border-b border-stone-300 px-2 py-1.5 text-left text-[11px] font-semibold tracking-wider text-stone-500 uppercase";

// The event quote (/quote, florists) as a printable sheet, from the same
// URL the quote's "Copy link" makes — so what prints is what was on screen,
// at today's costs. Only for industries with event quotes and cost sheets.
export default async function EventSheetPage({ searchParams }: { searchParams: Promise<Params> }) {
  const industry = await getIndustry();
  if (industry.features.quote !== "event" || !industry.features.costSheets) notFound();
  const p = await searchParams;
  const supabase = await createClient();
  const v = industry.vocab;
  const [{ data: recipes }, { data: costs }, { data: org }] = await Promise.all([
    supabase.from("recipes").select("id, name, batch_yield_unit"),
    supabase.from("recipe_costs").select("recipe_id, cost_per_serving"),
    supabase.from("organizations").select("name, target_margin_pct, default_labor_rate_per_hour").maybeSingle(),
  ]);
  const byId = new Map((recipes ?? []).map((r) => [r.id, r]));
  const costOf = new Map((costs ?? []).map((c) => [c.recipe_id, c.cost_per_serving == null ? null : Number(c.cost_per_serving)]));
  const items = (p.items ?? "")
    .split(",")
    .map((pair) => pair.split(":"))
    .filter(([id, qty]) => byId.has(id) && Number(qty) > 0)
    .map(([id, qty]) => ({ id, name: byId.get(id)!.name, quantity: Number(qty), costEach: costOf.get(id) ?? null }));
  const target = num(p.target) ?? Number(org?.target_margin_pct ?? 65);
  const q = eventQuote({
    items,
    delivery: num(p.delivery),
    setupMinutes: num(p.setup_minutes),
    laborRatePerHour: num(p.rate) ?? Number(org?.default_labor_rate_per_hour ?? 0),
    otherCosts: num(p.other),
    targetMarginPct: target,
    price: num(p.price),
  });
  const price = num(p.price) ?? q.suggestedPrice;
  const back = new URLSearchParams(Object.entries(p).filter((e): e is [string, string] => typeof e[1] === "string")).toString();

  return (
    <article className="mx-auto max-w-3xl" data-testid="event-sheet">
      <SheetBar backHref={`/quote?${back}`} backLabel="Back to the quote" />
      <header className="flex flex-wrap items-end justify-between gap-2 border-b-2 border-stone-900 pb-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.14em] text-stone-500 uppercase">{org?.name ?? "Event quote"} · event quote</p>
          <h1 className="mt-1 text-2xl font-semibold">{p.name?.trim() || "Event"}</h1>
        </div>
        <p className="text-sm text-stone-500">Costs as of <Today /></p>
      </header>

      <table className="mt-5 w-full">
        <thead>
          <tr><th className={th}>{v.recipe}</th><th className={`${th} text-right`}>How many</th><th className={`${th} text-right`}>Cost each</th><th className={`${th} text-right`}>Cost</th></tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id}>
              <td className={td}>{i.name}</td>
              <td className={tdR}>{i.quantity}</td>
              <td className={tdR}>{i.costEach == null ? <span className="text-amber-700">no cost yet</span> : money(i.costEach)}</td>
              <td className={tdR}>{i.costEach == null ? "—" : money(i.quantity * i.costEach)}</td>
            </tr>
          ))}
          {q.setupLabor > 0 && <tr><td className={td} colSpan={3}>Setup labor ({num(p.setup_minutes)} min)</td><td className={tdR}>{money(q.setupLabor)}</td></tr>}
          {q.extras > 0 && <tr><td className={td} colSpan={3}>Delivery and other costs</td><td className={tdR}>{money(q.extras)}</td></tr>}
        </tbody>
      </table>
      {q.unpriced.length > 0 && <p className="mt-2 text-xs text-amber-800">No cost yet for {q.unpriced.join(", ")}: a {lower(v.ingredient)} in it has no price.</p>}

      <section className="mt-5 ml-auto max-w-sm" data-testid="event-sheet-totals">
        <table className="w-full">
          <tbody>
            <tr className="font-semibold"><td className={td}>Total cost</td><td className={tdR}>{money(q.totalCost)}</td></tr>
            <tr><td className={td}>Suggested price at {target}%</td><td className={tdR}>{money(q.suggestedPrice)}</td></tr>
            {num(p.price) != null && <tr><td className={td}>Quoted price</td><td className={tdR}>{money(num(p.price))}</td></tr>}
            <tr className="text-base font-semibold">
              <td className="px-2 py-2">Margin at {money(price)}</td>
              <td className="px-2 py-2 text-right tabular-nums">{num(p.price) != null ? (q.marginAtPrice == null ? "—" : `${q.marginAtPrice}%`) : q.suggestedPrice == null ? "—" : `${target}%`}</td>
            </tr>
          </tbody>
        </table>
      </section>
      <footer className="mt-8 border-t border-stone-200 pt-2 text-[11px] text-stone-400">
        Each {lower(v.recipe)}&apos;s cost includes its {lower(v.ingredients)}, spoilage, labor and overhead as of <Today />. Margin = (price − cost) ÷ price.
      </footer>
    </article>
  );
}
