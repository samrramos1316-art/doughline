import { HBar, money } from "@/components/ui/dash";

// One batch's cost split the way the recipe_costs view adds it up (migration
// 025): materials (waste included) + labor, then overhead on top. The recipe
// page shows it only once a recipe uses waste, labor or overhead — a plain
// food recipe is all materials and its ingredient table already says so.
export function CostBreakdown({
  materials,
  wasteExtra,
  labor,
  laborDetail,
  overhead,
  overheadPct,
  total,
  perServing,
  yieldQty,
  yieldUnit,
  materialsLabel = "Ingredients",
  machine = 0,
  machineDetail = null,
}: {
  materials: number;
  wasteExtra: number; // the part of `materials` that's waste
  labor: number;
  laborDetail: string | null; // "45 min × $18.00/h"
  overhead: number;
  overheadPct: number;
  total: number;
  perServing: number | null;
  yieldQty: number;
  yieldUnit: string;
  materialsLabel?: string;
  machine?: number; // machine time (migration 029); the row shows only when > 0
  machineDetail?: string | null;
}) {
  const parts = [
    {
      label: materialsLabel,
      value: materials,
      detail: wasteExtra > 0 ? `includes ${money(wasteExtra)} of waste` : null,
      color: "#d97706",
    },
    { label: "Labor", value: labor, detail: laborDetail, color: "#0d9488" },
    ...(machine > 0 ? [{ label: "Machine time", value: machine, detail: machineDetail, color: "#4f46e5" }] : []),
    { label: "Overhead", value: overhead, detail: overheadPct > 0 ? `${overheadPct}% of ${materialsLabel.toLowerCase()} + labor${machine > 0 ? " + machine time" : ""}` : null, color: "#78716c" },
  ];
  return (
    <div>
      <ul className="space-y-2.5">
        {parts.map((p) => (
          <li key={p.label}>
            <div className="flex items-baseline justify-between gap-2 text-[13px]">
              <span className="text-stone-800">
                {p.label}
                {p.detail && <span className="ml-1.5 text-xs text-stone-500">{p.detail}</span>}
              </span>
              <span className="shrink-0 text-stone-600 tabular-nums">
                {money(p.value)}
                <span className="ml-1.5 inline-block w-9 text-right text-xs text-stone-500">{total > 0 ? `${Math.round((p.value / total) * 100)}%` : "—"}</span>
              </span>
            </div>
            <HBar share={total > 0 ? p.value / total : 0} color={p.color} />
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-baseline justify-between border-t border-stone-200 pt-2 text-sm font-semibold text-stone-900">
        <span>Batch cost</span>
        <span className="tabular-nums">
          {money(total)}
          {perServing != null && <span className="ml-2 text-xs font-normal text-stone-500">÷ {yieldQty} {yieldUnit} = ${perServing.toFixed(4)} each</span>}
        </span>
      </div>
    </div>
  );
}
