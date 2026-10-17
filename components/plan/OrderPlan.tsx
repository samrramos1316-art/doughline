"use client";

import { useMemo, useState } from "react";
import { EditableGrid, blankRow, gridErrors, isBlankRow, parseNumber, type GridColumn, type GridRow } from "@/components/grid/EditableGrid";
import { useVocab } from "@/components/app/VocabProvider";
import { planOrder, type PlanMaterial, type PlanRecipe } from "@/lib/costing/orderPlan";
import { lower } from "@/lib/vocab";
import { money } from "@/components/ui/dash";

export type PlanArrangement = { id: string; name: string } & PlanRecipe;
export type PlanStart = { name: string; items: { recipe_id: string; quantity: string }[] };

const input = "w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm outline-none focus:border-stone-500 focus:ring-2 focus:ring-amber-200";
const qty = (n: number) => Number(n.toFixed(2)).toLocaleString("en-US");
const plural = (unit: string, n: number) => (n === 1 ? unit : /(x|ch|sh|s)$/.test(unit) ? `${unit}es` : `${unit}s`);

// The week's orders → what to buy (lib/costing/orderPlan.ts). Nothing is
// saved; "Copy link" keeps the orders in the URL, like the event quote.
export function OrderPlan({ arrangements, materials, start }: { arrangements: PlanArrangement[]; materials: [string, PlanMaterial][]; start: PlanStart }) {
  const v = useVocab();
  const recipes = useMemo(() => new Map(arrangements.map((a) => [a.id, a])), [arrangements]);
  const mats = useMemo(() => new Map(materials), [materials]);
  const columns: GridColumn[] = useMemo(
    () => [
      { key: "recipe_id", label: v.recipe, type: "select", required: true, minWidth: 260, options: arrangements.map((a) => ({ value: a.id, label: a.name })) },
      { key: "quantity", label: "How many", type: "number", align: "right", required: true, minWidth: 100, validate: (q) => (parseNumber(q) === 0 ? "At least 1" : null) },
    ],
    [arrangements, v.recipe],
  );
  const [rows, setRows] = useState<GridRow[]>(() => [...start.items.map((it, i) => ({ key: `start-${i}`, values: { ...it } })), blankRow(columns)]);
  const [name, setName] = useState(start.name);
  const [copied, setCopied] = useState(false);
  const errors = gridErrors(columns, rows);
  const filled = rows.filter((r) => !isBlankRow(columns, r) && r.values.recipe_id && (parseNumber(r.values.quantity) ?? 0) > 0);
  const plan = planOrder(filled.map((r) => ({ recipeId: r.values.recipe_id, count: parseNumber(r.values.quantity) ?? 0 })), recipes, mats);

  if (arrangements.length === 0) return <p className="text-sm text-stone-500">Build your {lower(v.recipes)} first; the plan adds up what they use.</p>;

  return (
    <div className="grid gap-5 xl:grid-cols-12">
      <div className="flex flex-col gap-4 xl:col-span-5">
        <label className="block text-sm">
          <span className="font-medium text-stone-800">Orders for</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Week of Feb 9" className={`${input} mt-1`} />
        </label>
        <EditableGrid label={`${v.recipes} to make`} columns={columns} rows={rows} onChange={setRows} showAllErrors={false} canDeleteRow={() => true} onDeleteRow={(r) => setRows(rows.filter((x) => x.key !== r.key))} />
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={errors.size > 0 || filled.length === 0}
            onClick={async () => {
              const p = new URLSearchParams();
              if (name.trim()) p.set("name", name.trim());
              p.set("items", filled.map((r) => `${r.values.recipe_id}:${parseNumber(r.values.quantity)}`).join(","));
              const url = `${window.location.origin}/plan?${p.toString()}`;
              window.history.replaceState(null, "", url);
              try {
                await navigator.clipboard.writeText(url);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
            className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            Copy link to this plan
          </button>
          {copied && <span className="text-sm text-green-700">Copied. The link reopens these orders.</span>}
        </div>
      </div>

      <div className="flex flex-col gap-3 xl:col-span-7">
        <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
          <table className="w-full text-[13px]" data-testid="order-plan">
            <thead>
              <tr className="text-[11px] font-semibold tracking-wider text-stone-500 uppercase">
                <th className="px-3 py-2 text-left">{v.ingredient}</th>
                <th className="px-3 py-2 text-right">Used</th>
                <th className="px-3 py-2 text-right">With spoilage</th>
                <th className="px-3 py-2 text-left">Buy</th>
                <th className="px-3 py-2 text-right">Cost</th>
              </tr>
            </thead>
            <tbody>
              {plan.rows.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-stone-500">Add the {lower(v.recipes)} you&apos;re making and how many.</td></tr>
              )}
              {plan.rows.map((r) => {
                const best = r.packs[0];
                return (
                  <tr key={r.ingredientId} className="border-t border-stone-100" data-name={r.name}>
                    <td className="px-3 py-1.5 text-stone-900">{r.name}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-stone-600">{qty(r.used)} {r.unit}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {qty(r.toBuy)} {r.unit}
                      {r.spoilage.max > 0 && <span className="block text-[11px] text-stone-500">+{r.spoilage.min === r.spoilage.max ? r.spoilage.max : `${r.spoilage.min}–${r.spoilage.max}`}% loss</span>}
                    </td>
                    <td className="px-3 py-1.5">
                      {best ? (
                        <>
                          <b>{best.count} {plural(best.unit, best.count)}</b> of {qty(best.size)}
                          <span className="text-stone-500">{best.spare > 0 ? ` (${qty(best.spare)} spare)` : ""}</span>
                          {r.packs.slice(1).map((p) => (
                            <span key={p.unit} className="block text-[11px] text-stone-500">or {p.count} {plural(p.unit, p.count)} of {qty(p.size)}{p.spare > 0 ? ` (${qty(p.spare)} spare)` : ""}</span>
                          ))}
                        </>
                      ) : (
                        <b>{qty(r.toBuy)} {r.unit}</b>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{r.cost == null ? <span className="text-amber-700">no price</span> : money(r.cost)}</td>
                  </tr>
                );
              })}
              {plan.rows.length > 0 && (
                <tr className="border-t-2 border-stone-900 font-semibold">
                  <td className="px-3 py-2" colSpan={4}>Total at today&apos;s prices</td>
                  <td className="px-3 py-2 text-right tabular-nums" data-testid="order-plan-total">{money(plan.totalCost)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-stone-500">
          Spoilage is each {lower(v.ingredient)}&apos;s loss % (or the {lower(v.recipe)} line&apos;s own). Bunch and box sizes come from the {v.ingredients} page; the
          best fit leaves the fewest spare. Cost is what you need at today&apos;s prices, not counting the spare.
        </p>
      </div>
    </div>
  );
}
