"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { EditableGrid, blankRow, gridErrors, isBlankRow, parseNumber, type GridColumn, type GridRow } from "@/components/grid/EditableGrid";
import { CostBreakdown } from "@/components/recipes/CostBreakdown";
import { useVocab } from "@/components/app/VocabProvider";
import { effectiveWastePct, laborRate, lineCost, machineRate } from "@/lib/costing/recipeCost";
import { quote } from "@/lib/costing/quote";
import { cap, lower } from "@/lib/vocab";
import { money } from "@/components/ui/dash";

type Material = { id: string; name: string; base_unit: string; unitCost: number | null; wastePct: number };
export type QuoteStart = {
  name: string;
  pieces: number;
  lines: { ingredient_id: string; quantity: string; waste_pct: string }[];
  labor_minutes: number;
  labor_rate_per_hour: number | null;
  overhead_pct: number;
  machine_minutes?: number; // job mode (migration 029)
  machine_rate_per_hour?: number | null;
};

// Wording per mode. "piece" (jewelry) is the step-3 calculator as it was;
// "job" (fabrication) adds machine time and talks in parts.
const COPY = {
  piece: { name: "Piece", namePlaceholder: "e.g. Custom signet ring", count: "Pieces", countHint: "How many this quote makes.", one: "piece", many: "pieces", loss: "filing, polishing, casting", laborHint: "Bench time for the whole quote.", nameIt: "Name the piece", howMany: "How many pieces does this quote make?" },
  job: { name: "Job", namePlaceholder: "e.g. Mounting bracket, 50 off", count: "Parts", countHint: "How many parts the job makes.", one: "part", many: "parts", loss: "scrap, kerf, drops", laborHint: "Hands-on time for the whole job: setup, fit-up, welding, finishing.", nameIt: "Name the job", howMany: "How many parts does this job make?" },
} as const;

const input = "w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm outline-none focus:border-stone-500 focus:ring-2 focus:ring-amber-200";
const blankIfZero = (n: number) => (n === 0 ? "" : String(n));

// Live custom-order quote: the same cost formula as a saved build sheet
// (lib/costing/quote.ts → recipeCost.ts), so a quote kept as a build sheet
// costs exactly what the quote said. A blank loss % follows the material's.
export function QuoteCalculator({
  materials,
  start,
  targetMarginPct,
  defaultLaborRate,
  mode = "piece",
  defaultMachineRate = 0,
}: {
  materials: Material[];
  start: QuoteStart;
  targetMarginPct: number;
  defaultLaborRate: number;
  mode?: "piece" | "job";
  defaultMachineRate?: number;
}) {
  const c = COPY[mode];
  const job = mode === "job";
  const v = useVocab();
  const router = useRouter();
  const byId = useMemo(() => new Map(materials.map((m) => [m.id, m])), [materials]);
  const columns: GridColumn[] = useMemo(
    () => [
      { key: "ingredient_id", label: v.ingredient, type: "select", required: true, minWidth: 240, options: materials.map((m) => ({ value: m.id, label: m.name })) },
      {
        key: "quantity",
        label: "Quantity",
        type: "number",
        align: "right",
        required: true,
        minWidth: 100,
        validate: (q) => (parseNumber(q) === 0 ? "Quantity must be more than 0" : null),
      },
      { key: "unit", label: "Unit", minWidth: 70, readOnly: () => true },
      {
        key: "waste_pct",
        label: "Loss %",
        type: "number",
        align: "right",
        minWidth: 80,
        rowPlaceholder: (r) => (r.values.ingredient_id ? String(byId.get(r.values.ingredient_id)?.wastePct ?? 0) : undefined),
        validate: (w) => ((parseNumber(w) ?? 0) >= 100 ? "Loss must be under 100%" : null),
      },
    ],
    [materials, byId, v.ingredient],
  );
  const [rows, setRows] = useState<GridRow[]>(() => [
    ...start.lines.map((l, i) => ({ key: `start-${i}`, values: { ...l, unit: byId.get(l.ingredient_id)?.base_unit ?? "" } })),
    blankRow(columns),
  ]);
  const [f, setF] = useState({
    name: start.name,
    pieces: String(start.pieces),
    labor_minutes: blankIfZero(start.labor_minutes),
    labor_rate_per_hour: start.labor_rate_per_hour == null ? "" : String(start.labor_rate_per_hour),
    overhead_pct: blankIfZero(start.overhead_pct),
    machine_minutes: blankIfZero(start.machine_minutes ?? 0),
    machine_rate_per_hour: start.machine_rate_per_hour == null ? "" : String(start.machine_rate_per_hour),
    target: String(targetMarginPct),
    price: "",
  });
  const [showAllErrors, setShowAllErrors] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Keep each row's unit in step with its material.
  function handleChange(next: GridRow[]) {
    setRows(next.map((r) => {
      const unit = byId.get(r.values.ingredient_id)?.base_unit ?? "";
      return r.values.unit === unit ? r : { ...r, values: { ...r.values, unit } };
    }));
  }

  const filled = rows.filter((r) => !isBlankRow(columns, r) && r.values.ingredient_id && (parseNumber(r.values.quantity) ?? 0) > 0);
  const lines = filled.map((r) => {
    const m = byId.get(r.values.ingredient_id);
    const qty = parseNumber(r.values.quantity) ?? 0;
    const waste = effectiveWastePct(parseNumber(r.values.waste_pct ?? ""), m?.wastePct ?? 0);
    return { name: m?.name ?? "?", quantity: qty, unitCost: m?.unitCost ?? null, wastePct: waste };
  });
  const laborOverhead = {
    laborMinutes: parseNumber(f.labor_minutes) ?? 0,
    laborRatePerHour: parseNumber(f.labor_rate_per_hour),
    defaultLaborRatePerHour: defaultLaborRate,
    overheadPct: parseNumber(f.overhead_pct) ?? 0,
    ...(job ? { machineMinutes: parseNumber(f.machine_minutes) ?? 0, machineRatePerHour: parseNumber(f.machine_rate_per_hour), defaultMachineRatePerHour: defaultMachineRate } : {}),
  };
  const pieces = parseNumber(f.pieces) ?? 0;
  const target = parseNumber(f.target) ?? targetMarginPct;
  const ownPrice = parseNumber(f.price);
  const q = quote({ lines, laborOverhead, pieces, targetMarginPct: target, price: ownPrice });
  const wasteExtra = lines.reduce((s, l) => s + (l.unitCost == null ? 0 : lineCost(l.quantity, l.unitCost, l.wastePct) - l.quantity * l.unitCost), 0);
  const sellAt = ownPrice != null && ownPrice > 0 ? ownPrice : q.suggestedPrice;

  async function keep() {
    setShowAllErrors(true);
    setError(null);
    if (gridErrors(columns, rows).size) return setError("Fix the highlighted rows first — nothing was saved.");
    if (!f.name.trim()) return setError(`${c.nameIt} to keep it as a ${lower(v.recipe)}.`);
    if (!(pieces > 0)) return setError(c.howMany);
    if (!filled.length) return setError(`Add at least one ${lower(v.ingredient)}.`);
    if (sellAt == null) return setError("There's no price yet: give every material a price, or type your own price.");
    setSaving(true);
    const res = await fetch("/api/recipes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: f.name.trim(),
        batch_yield_qty: pieces,
        batch_yield_unit: pieces === 1 ? c.one : c.many,
        labor_minutes: laborOverhead.laborMinutes,
        labor_rate_per_hour: laborOverhead.laborRatePerHour,
        overhead_pct: laborOverhead.overheadPct,
        ...(job ? { machine_minutes: laborOverhead.machineMinutes, machine_rate_per_hour: laborOverhead.machineRatePerHour } : {}),
        ingredients: filled.map((r) => ({
          ingredient_id: r.values.ingredient_id,
          quantity: parseNumber(r.values.quantity),
          unit: byId.get(r.values.ingredient_id)?.base_unit,
          waste_pct: parseNumber(r.values.waste_pct ?? ""), // blank = the material's loss %
        })),
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setSaving(false);
      return setError(body.error ?? "Saving the build sheet failed");
    }
    const item = await fetch("/api/menu-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: f.name.trim(), recipe_id: body.recipe.id, selling_price: sellAt }),
    });
    setSaving(false);
    if (!item.ok) {
      const b = await item.json().catch(() => ({}));
      setError(`The ${lower(v.recipe)} was saved, but adding the ${lower(v.menuItem)} failed: ${b.error ?? item.status}`);
      return;
    }
    router.push(`/recipes/${body.recipe.id}`);
  }

  if (materials.length === 0) {
    return <p className="text-sm text-stone-500">Add your {lower(v.ingredients)} with their prices first; a quote is built from them.</p>;
  }

  const field = (key: keyof typeof f, label: string, hint: string, placeholder = "0") => (
    <label className="block text-sm">
      <span className="font-medium text-stone-800">{label}</span>
      <input type="number" min="0" step="any" inputMode="decimal" value={f[key]} placeholder={placeholder} onChange={(e) => setF({ ...f, [key]: e.target.value })} className={`${input} mt-1`} />
      <span className="mt-1 block text-xs text-stone-500">{hint}</span>
    </label>
  );

  return (
    <div className="grid gap-5 xl:grid-cols-12">
      <div className="flex flex-col gap-4 xl:col-span-7">
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
          <label className="block text-sm">
            <span className="font-medium text-stone-800">{c.name}</span>
            <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={c.namePlaceholder} className={`${input} mt-1`} />
          </label>
          {field("pieces", c.count, c.countHint, "1")}
        </div>
        <EditableGrid label={`${v.ingredients} in the quote`} columns={columns} rows={rows} onChange={handleChange} showAllErrors={showAllErrors} canDeleteRow={() => true} onDeleteRow={(r) => setRows(rows.filter((x) => x.key !== r.key))} />
        <p className="-mt-2 text-xs text-stone-500">A blank Loss % uses the {lower(v.ingredient)}&apos;s own ({c.loss}); type a number to override it here.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {field("labor_minutes", "Labor minutes", c.laborHint)}
          {field("labor_rate_per_hour", "Hourly rate ($)", defaultLaborRate > 0 ? `Blank uses your default, $${defaultLaborRate.toFixed(2)}/h.` : "Blank uses your default rate from Settings.", defaultLaborRate > 0 ? defaultLaborRate.toFixed(2) : "")}
          {field("overhead_pct", "Overhead %", job ? "On top of materials, labor and machine time." : "On top of materials and labor.")}
          {job && field("machine_minutes", "Machine minutes", "Run time on the laser, brake, saw or CNC for the whole job.")}
          {job &&
            field(
              "machine_rate_per_hour",
              "Machine rate ($/h)",
              defaultMachineRate > 0 ? `Blank uses your default, $${defaultMachineRate.toFixed(2)}/h.` : "What an hour of machine time costs you. Blank uses your default from Settings.",
              defaultMachineRate > 0 ? defaultMachineRate.toFixed(2) : "",
            )}
        </div>
      </div>

      <div className="flex flex-col gap-4 xl:col-span-5">
        {q.batch ? (
          <CostBreakdown
            materials={q.batch.materials}
            wasteExtra={wasteExtra}
            labor={q.batch.labor}
            laborDetail={laborOverhead.laborMinutes > 0 ? `${laborOverhead.laborMinutes} min × $${laborRate(laborOverhead).toFixed(2)}/h` : null}
            machine={q.batch.machine}
            machineDetail={job && (laborOverhead.machineMinutes ?? 0) > 0 ? `${laborOverhead.machineMinutes} min × $${machineRate(laborOverhead).toFixed(2)}/h` : null}
            overhead={q.batch.overhead}
            overheadPct={laborOverhead.overheadPct}
            total={q.batch.total}
            perServing={q.costPerPiece}
            yieldQty={pieces}
            yieldUnit={pieces === 1 ? c.one : c.many}
            materialsLabel={v.ingredients}
          />
        ) : (
          <p className="rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm text-stone-600" data-testid="quote-missing">
            {q.unpriced
              ? `${q.unpriced} ${lower(q.unpriced === 1 ? v.ingredient : v.ingredients)} without a price yet — add prices on the ${v.ingredients} page (or scan the invoice) to cost this quote.`
              : `Add ${lower(v.ingredients)} to see the cost.`}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          {field("target", "Target margin %", "From Settings; change it for this quote.", String(targetMarginPct))}
          {field("price", "Your price ($, optional)", "Quote your own number and see its margin.", "")}
        </div>
        <div className="rounded-lg border-2 border-stone-900 bg-white px-4 py-3" data-testid="quote-result">
          <p className="text-[11px] font-semibold tracking-wider text-stone-500 uppercase">Suggested price per {c.one}</p>
          <p className="mt-1 text-3xl font-semibold text-stone-900 tabular-nums">{money(q.suggestedPrice)}</p>
          <p className="mt-1 text-xs text-stone-500">
            {q.costPerPiece == null ? "Needs a cost first." : `Costs ${money(q.costPerPiece)} to make; at ${money(q.suggestedPrice)} you keep ${target}%.`}
          </p>
          {job && sellAt != null && pieces > 1 && (
            <p className="mt-2 text-sm text-stone-800" data-testid="quote-job-total">
              Job total: {pieces} × {money(sellAt)} = <b className="tabular-nums">{money(pieces * sellAt)}</b>
              {q.batch ? <span className="text-stone-500"> (costs {money(q.batch.total)})</span> : null}
            </p>
          )}
          {q.marginAtPrice != null && (
            <p className={`mt-2 text-sm font-medium ${q.marginAtPrice < target ? "text-red-600" : "text-green-700"}`} data-testid="quote-own-margin">
              At your {money(ownPrice)}: {q.marginAtPrice}% margin{q.marginAtPrice < target ? `, under your ${target}% target` : ""}.
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={keep} disabled={saving} className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50">
            {saving ? "Saving…" : `Keep as a ${lower(v.recipe)} and ${lower(v.menuItem)}`}
          </button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <p className="text-xs text-stone-500">{cap(lower(v.menuItem))} price: your price if you typed one, else the suggested price. Material prices change with your invoices; the quote doesn&apos;t lock them.</p>
      </div>
    </div>
  );
}
