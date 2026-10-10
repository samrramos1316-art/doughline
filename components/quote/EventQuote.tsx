"use client";

import { useMemo, useState } from "react";
import { EditableGrid, blankRow, gridErrors, isBlankRow, parseNumber, type GridColumn, type GridRow } from "@/components/grid/EditableGrid";
import { useVocab } from "@/components/app/VocabProvider";
import { eventQuote } from "@/lib/costing/quote";
import { lower } from "@/lib/vocab";
import { money } from "@/components/ui/dash";

type Arrangement = { id: string; name: string; costEach: number | null; unit: string };
export type EventStart = {
  name: string;
  items: { recipe_id: string; quantity: string }[];
  delivery: string;
  setup_minutes: string;
  rate: string;
  other: string;
  target: string;
  price: string;
};

const input = "w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm outline-none focus:border-stone-500 focus:ring-2 focus:ring-amber-200";

// Event / wedding quote (docs: florist core): arrangements at their live
// cost per piece × how many, plus delivery, setup time and other costs,
// priced at a target margin. Nothing is saved; "Copy link" keeps the quote
// in the URL so it can be reopened or sent on.
export function EventQuote({
  arrangements,
  start,
  targetMarginPct,
  defaultLaborRate,
}: {
  arrangements: Arrangement[];
  start: EventStart;
  targetMarginPct: number;
  defaultLaborRate: number;
}) {
  const v = useVocab();
  const byId = useMemo(() => new Map(arrangements.map((a) => [a.id, a])), [arrangements]);
  const columns: GridColumn[] = useMemo(
    () => [
      { key: "recipe_id", label: v.recipe, type: "select", required: true, minWidth: 260, options: arrangements.map((a) => ({ value: a.id, label: a.name })) },
      {
        key: "quantity",
        label: "How many",
        type: "number",
        align: "right",
        required: true,
        minWidth: 100,
        validate: (q) => (parseNumber(q) === 0 ? "At least 1" : null),
      },
    ],
    [arrangements, v.recipe],
  );
  const [rows, setRows] = useState<GridRow[]>(() => [...start.items.map((it, i) => ({ key: `start-${i}`, values: { ...it } })), blankRow(columns)]);
  const [f, setF] = useState(start);
  const [copied, setCopied] = useState(false);
  const errors = gridErrors(columns, rows);

  const filled = rows.filter((r) => !isBlankRow(columns, r) && r.values.recipe_id && (parseNumber(r.values.quantity) ?? 0) > 0);
  const items = filled.map((r) => {
    const a = byId.get(r.values.recipe_id);
    return { id: r.values.recipe_id, name: a?.name ?? "?", unit: a?.unit ?? "", quantity: parseNumber(r.values.quantity) ?? 0, costEach: a?.costEach ?? null };
  });
  const target = parseNumber(f.target) ?? targetMarginPct;
  const rate = parseNumber(f.rate) ?? defaultLaborRate;
  const ownPrice = parseNumber(f.price);
  const q = eventQuote({
    items,
    delivery: parseNumber(f.delivery),
    setupMinutes: parseNumber(f.setup_minutes),
    laborRatePerHour: rate,
    otherCosts: parseNumber(f.other),
    targetMarginPct: target,
    price: ownPrice,
  });

  function link(path = "/quote") {
    const p = new URLSearchParams();
    if (f.name.trim()) p.set("name", f.name.trim());
    p.set("items", filled.map((r) => `${r.values.recipe_id}:${parseNumber(r.values.quantity)}`).join(","));
    for (const k of ["delivery", "setup_minutes", "rate", "other", "target", "price"] as const) if (f[k].trim()) p.set(k, f[k].trim());
    return `${window.location.origin}${path}?${p.toString()}`;
  }

  if (arrangements.length === 0) {
    return <p className="text-sm text-stone-500">Build your {lower(v.recipes)} first; an event quote adds them up.</p>;
  }

  const field = (key: Exclude<keyof EventStart, "items">, label: string, hint: string, placeholder = "0") => (
    <label className="block text-sm">
      <span className="font-medium text-stone-800">{label}</span>
      <input type="number" min="0" step="any" inputMode="decimal" value={f[key]} placeholder={placeholder} onChange={(e) => setF({ ...f, [key]: e.target.value })} className={`${input} mt-1`} />
      <span className="mt-1 block text-xs text-stone-500">{hint}</span>
    </label>
  );

  return (
    <div className="grid gap-5 xl:grid-cols-12">
      <div className="flex flex-col gap-4 xl:col-span-7">
        <label className="block text-sm">
          <span className="font-medium text-stone-800">Event</span>
          <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Rivera wedding, June 14" className={`${input} mt-1`} />
        </label>
        <EditableGrid label={`${v.recipes} in the event`} columns={columns} rows={rows} onChange={setRows} showAllErrors={false} canDeleteRow={() => true} onDeleteRow={(r) => setRows(rows.filter((x) => x.key !== r.key))} />
        <div className="grid gap-3 sm:grid-cols-2">
          {field("delivery", "Delivery ($)", "Driving, van, fuel for this event.")}
          {field("other", "Other costs ($)", "Rentals, stands, anything not in an arrangement.")}
          {field("setup_minutes", "Setup minutes", "On-site setup and breakdown.")}
          {field("rate", "Hourly rate ($)", defaultLaborRate > 0 ? `Blank uses your default, $${defaultLaborRate.toFixed(2)}/h.` : "Your rate for setup time.", defaultLaborRate > 0 ? defaultLaborRate.toFixed(2) : "0")}
        </div>
      </div>

      <div className="flex flex-col gap-4 xl:col-span-5">
        <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
          <table className="w-full text-[13px]" aria-label="Event cost">
            <tbody>
              {items.map((i, n) => (
                <tr key={`${i.id}-${n}`} className="border-t border-stone-100 first:border-t-0">
                  <td className="px-3 py-1.5 text-stone-800">{i.quantity} × {i.name}</td>
                  <td className="px-3 py-1.5 text-right text-stone-500 tabular-nums">{i.costEach == null ? <span className="text-amber-700">no cost yet</span> : `${money(i.costEach)} each`}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{i.costEach == null ? "—" : money(i.quantity * i.costEach)}</td>
                </tr>
              ))}
              {q.setupLabor > 0 && (
                <tr className="border-t border-stone-100"><td className="px-3 py-1.5" colSpan={2}>Setup labor</td><td className="px-3 py-1.5 text-right tabular-nums">{money(q.setupLabor)}</td></tr>
              )}
              {q.extras > 0 && (
                <tr className="border-t border-stone-100"><td className="px-3 py-1.5" colSpan={2}>Delivery and other costs</td><td className="px-3 py-1.5 text-right tabular-nums">{money(q.extras)}</td></tr>
              )}
              <tr className="border-t-2 border-stone-900 font-semibold">
                <td className="px-3 py-2" colSpan={2}>Total cost</td>
                <td className="px-3 py-2 text-right tabular-nums" data-testid="event-total-cost">{money(q.totalCost)}</td>
              </tr>
            </tbody>
          </table>
          {q.unpriced.length > 0 && (
            <p className="border-t border-stone-100 px-3 py-2 text-xs text-amber-800">
              No cost yet for {q.unpriced.join(", ")}: a {lower(v.ingredient)} in it has no price. Add it on the {v.ingredients} page or scan the invoice.
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          {field("target", "Target margin %", "From Settings; change it for this event.", String(targetMarginPct))}
          {field("price", "Your price ($, optional)", "Quote your own total and see its margin.", "")}
        </div>
        <div className="rounded-lg border-2 border-stone-900 bg-white px-4 py-3" data-testid="quote-result">
          <p className="text-[11px] font-semibold tracking-wider text-stone-500 uppercase">Suggested price for the event</p>
          <p className="mt-1 text-3xl font-semibold text-stone-900 tabular-nums">{money(q.suggestedPrice)}</p>
          <p className="mt-1 text-xs text-stone-500">
            {q.totalCost == null ? `Add ${lower(v.recipes)} with a cost first.` : `Costs ${money(q.totalCost)}; at ${money(q.suggestedPrice)} you keep ${target}%.`}
          </p>
          {q.marginAtPrice != null && (
            <p className={`mt-2 text-sm font-medium ${q.marginAtPrice < target ? "text-red-600" : "text-green-700"}`} data-testid="quote-own-margin">
              At your {money(ownPrice)}: {q.marginAtPrice}% margin{q.marginAtPrice < target ? `, under your ${target}% target` : ""}.
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={errors.size > 0}
            onClick={async () => {
              const url = link();
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
            Copy link to this quote
          </button>
          <button
            type="button"
            disabled={errors.size > 0 || filled.length === 0}
            onClick={() => window.location.assign(link("/sheet/event"))}
            className="rounded-full border border-stone-300 bg-white px-5 py-2.5 text-sm font-medium text-stone-800 hover:border-stone-500 disabled:opacity-50"
          >
            Printable quote
          </button>
          {copied && <span className="text-sm text-green-700">Copied. The link reopens this quote with today&apos;s costs.</span>}
        </div>
        <p className="text-xs text-stone-500">Costs are live: each {lower(v.recipe)}&apos;s cost moves with your invoices, spoilage % and labor, so a reopened quote shows today&apos;s numbers.</p>
      </div>
    </div>
  );
}
