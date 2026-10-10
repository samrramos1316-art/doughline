import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getIndustry } from "@/lib/supabase/vocab";
import { effectiveWastePct, laborOverheadOf, laborRate, lineCost, machineRate } from "@/lib/costing/recipeCost";
import { priceForMargin } from "@/lib/costing/quote";
import { lower } from "@/lib/vocab";
import { Today } from "@/components/print/Today";
import { SheetBar } from "@/components/print/SheetBar";

export const metadata: Metadata = { title: "Cost sheet" };

const money = (n: number | null | undefined, dp = 2) => (n == null ? "—" : `$${n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`);
const unit$ = (n: number | null | undefined) => (n == null ? "—" : `$${n.toFixed(n < 1 ? 4 : 2)}`);
const th = "border-b border-stone-300 px-2 py-1.5 text-left text-[11px] font-semibold tracking-wider text-stone-500 uppercase";
const thR = `${th} text-right`;
const td = "border-b border-stone-100 px-2 py-1.5 text-[13px]";
const tdR = `${td} text-right tabular-nums`;

// A cost sheet (docs: "a clean, printable cost breakdown per product"): one
// build sheet / arrangement — every material with its loss %, labor,
// overhead, cost per piece — and each product sold from it with its price,
// margin and the price that would hit the target. Numbers come from the
// same views and formula as the rest of the app. Only for industries with
// cost sheets turned on (lib/industries `features.costSheets`).
export default async function CostSheetPage({ params }: { params: Promise<{ id: string }> }) {
  const industry = await getIndustry();
  if (!industry.features.costSheets) notFound();
  const { id } = await params;
  const supabase = await createClient();
  const v = industry.vocab;

  const [{ data: recipe }, { data: lines }, { data: cost }, { data: org }, { data: items }, { data: margins }] = await Promise.all([
    supabase.from("recipes").select("name, batch_yield_qty, batch_yield_unit, labor_minutes, labor_rate_per_hour, overhead_pct, machine_minutes, machine_rate_per_hour, notes").eq("id", id).maybeSingle(),
    supabase.from("recipe_ingredients").select("quantity, unit, waste_pct, ingredients(name, current_unit_cost, waste_pct)").eq("recipe_id", id),
    supabase.from("recipe_costs").select("batch_total_cost, cost_per_serving, materials_cost, labor_cost, machine_cost, unpriced_ingredients").eq("recipe_id", id).maybeSingle(),
    supabase.from("organizations").select("name, target_margin_pct, default_labor_rate_per_hour, default_machine_rate_per_hour").maybeSingle(),
    supabase.from("menu_items").select("id, name, selling_price, servings_per_batch, is_active").eq("recipe_id", id).order("name"),
    supabase.from("menu_item_margins").select("menu_item_id, cost_per_serving, margin_pct"),
  ]);
  if (!recipe) notFound();

  const target = Number(org?.target_margin_pct ?? 65);
  const rows = (lines ?? [])
    .map((l) => {
      const c = l.ingredients?.current_unit_cost == null ? null : Number(l.ingredients.current_unit_cost);
      const qty = Number(l.quantity);
      const waste = effectiveWastePct(l.waste_pct, l.ingredients?.waste_pct);
      return { name: l.ingredients?.name ?? "?", qty, unit: l.unit, waste, unitCost: c, line: c == null ? null : lineCost(qty, c, waste) };
    })
    .sort((a, b) => (b.line ?? 0) - (a.line ?? 0));
  const materials = cost?.materials_cost == null ? null : Number(cost.materials_cost);
  const labor = Number(cost?.labor_cost ?? 0);
  const machine = Number(cost?.machine_cost ?? 0);
  const batch = cost?.batch_total_cost == null ? null : Number(cost.batch_total_cost);
  // Never below 0: float noise in batch − materials − labor would print "$-0.00".
  const overhead = batch != null && materials != null ? Math.max(0, batch - materials - labor - machine) : null;
  const lo = laborOverheadOf(recipe, org);
  const marginOf = new Map((margins ?? []).map((m) => [m.menu_item_id, m]));
  const yieldQty = Number(recipe.batch_yield_qty);

  return (
    <article className="mx-auto max-w-3xl" data-testid="cost-sheet">
      <SheetBar backHref={`/recipes/${id}`} backLabel={`Back to the ${lower(v.recipe)}`} />
      <header className="flex flex-wrap items-end justify-between gap-2 border-b-2 border-stone-900 pb-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.14em] text-stone-500 uppercase">{org?.name ?? "Cost sheet"} · cost sheet</p>
          <h1 className="mt-1 text-2xl font-semibold">{recipe.name}</h1>
          <p className="text-sm text-stone-600">{v.yield} {yieldQty} {recipe.batch_yield_unit}</p>
        </div>
        <p className="text-sm text-stone-500">Prices as of <Today /></p>
      </header>

      <section className="mt-5">
        <h2 className="text-sm font-semibold">{v.ingredients}</h2>
        <table className="mt-2 w-full">
          <thead>
            <tr><th className={th}>{v.ingredient}</th><th className={thR}>Qty</th><th className={thR}>Loss</th><th className={thR}>Price</th><th className={thR}>Cost</th></tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.name}-${i}`}>
                <td className={td}>{r.name}</td>
                <td className={tdR}>{r.qty} {r.unit}</td>
                <td className={tdR}>{r.waste > 0 ? `${r.waste}%` : "—"}</td>
                <td className={tdR}>{r.unitCost == null ? <span className="text-amber-700">no price</span> : `${unit$(r.unitCost)}/${r.unit}`}</td>
                <td className={tdR}>{money(r.line)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {Number(cost?.unpriced_ingredients ?? 0) > 0 && (
          <p className="mt-2 text-xs text-amber-800">{cost?.unpriced_ingredients} without a price yet, so the totals below are incomplete.</p>
        )}
      </section>

      <section className="mt-5 ml-auto max-w-sm" data-testid="cost-sheet-totals">
        <table className="w-full">
          <tbody>
            <tr><td className={td}>{v.ingredients}{rows.some((r) => r.waste > 0) ? ", with loss" : ""}</td><td className={tdR}>{money(materials)}</td></tr>
            <tr><td className={td}>Labor{lo.laborMinutes > 0 ? ` (${lo.laborMinutes} min × ${money(laborRate(lo))}/h)` : ""}</td><td className={tdR}>{money(labor)}</td></tr>
            {machine > 0 && <tr><td className={td}>Machine time ({lo.machineMinutes} min × {money(machineRate(lo))}/h)</td><td className={tdR}>{money(machine)}</td></tr>}
            <tr><td className={td}>Overhead{Number(recipe.overhead_pct) > 0 ? ` (${Number(recipe.overhead_pct)}%)` : ""}</td><td className={tdR}>{money(overhead)}</td></tr>
            <tr className="font-semibold"><td className={td}>Total for {yieldQty} {recipe.batch_yield_unit}</td><td className={tdR}>{money(batch)}</td></tr>
            <tr className="text-base font-semibold"><td className="px-2 py-2">Cost per {v.serving}</td><td className="px-2 py-2 text-right tabular-nums">{cost?.cost_per_serving == null ? "—" : unit$(Number(cost.cost_per_serving))}</td></tr>
          </tbody>
        </table>
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-semibold">Sold as</h2>
        {(items ?? []).length === 0 ? (
          <p className="mt-1 text-sm text-stone-500">Not {v.onMenu} yet.</p>
        ) : (
          <table className="mt-2 w-full">
            <thead>
              <tr><th className={th}>{v.menuItem}</th><th className={thR}>Price</th><th className={thR}>Cost</th><th className={thR}>Margin</th><th className={thR}>Price for {target}%</th></tr>
            </thead>
            <tbody>
              {(items ?? []).map((m) => {
                const mm = marginOf.get(m.id);
                const costEach = mm?.cost_per_serving == null ? null : Number(mm.cost_per_serving);
                const pct = mm?.margin_pct == null ? null : Number(mm.margin_pct);
                return (
                  <tr key={m.id}>
                    <td className={td}>{m.name}{m.is_active ? "" : <span className="text-stone-400"> (not {v.onMenu})</span>}</td>
                    <td className={tdR}>{money(Number(m.selling_price))}</td>
                    <td className={tdR}>{unit$(costEach)}</td>
                    <td className={`${tdR} ${pct != null && pct < target ? "font-semibold text-red-700" : ""}`}>{pct == null ? "—" : `${pct}%`}</td>
                    <td className={tdR}>{money(priceForMargin(costEach, target))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {recipe.notes && <p className="mt-6 text-sm whitespace-pre-line text-stone-600">{recipe.notes}</p>}
      <footer className="mt-8 border-t border-stone-200 pt-2 text-[11px] text-stone-400">
        Costs move with your invoices; this sheet shows them as of <Today />. Margin = (price − cost) ÷ price.
      </footer>
    </article>
  );
}
