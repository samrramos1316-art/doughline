// Order plan (docs: florist "pre-order planning: from the week's orders,
// calculate stems to buy per type"): arrangements × how many, through each
// arrangement's recipe, to what to buy — with spoilage, in whole stems, and
// in the bunches or boxes the material comes in (migration 028 pack_sizes).
// Pure: no I/O, so it runs under `node --test` as is.
import { canonicalUnit, isContainerUnit, type PackSizes } from "./units.ts";

export type PlanRecipe = { yieldQty: number; lines: { ingredientId: string; quantity: number; wastePct: number | null }[] };
export type PlanMaterial = { name: string; baseUnit: string; wastePct: number; unitCost: number | null; packSizes: PackSizes };

export type PackOption = { unit: string; size: number; count: number; total: number; spare: number };
export type PlanRow = {
  ingredientId: string;
  name: string;
  unit: string;
  used: number; // what the arrangements hold
  spoilage: { min: number; max: number }; // loss % across its lines
  toBuy: number; // used, grossed up for spoilage, rounded up (whole stems, each…)
  packs: PackOption[]; // one per pack size the material has; best first
  cost: number | null; // toBuy at today's price
};

const round4 = (n: number) => Math.round(n * 10000) / 10000;
// Counted things are bought whole: a stem, a vase, a sheet, a bunch.
const counted = (unit: string) => ["each", "stem", "sheet"].includes(canonicalUnit(unit) ?? "") || (canonicalUnit(unit) == null && isContainerUnit(unit));

export function planOrder(
  orders: { recipeId: string; count: number }[],
  recipes: Map<string, PlanRecipe>,
  materials: Map<string, PlanMaterial>,
): { rows: PlanRow[]; totalCost: number | null; missing: string[] } {
  const need = new Map<string, { used: number; gross: number; min: number; max: number }>();
  const missing: string[] = [];
  for (const o of orders) {
    const r = recipes.get(o.recipeId);
    if (!r || !(o.count > 0) || !(r.yieldQty > 0)) continue;
    for (const l of r.lines) {
      const m = materials.get(l.ingredientId);
      if (!m) {
        missing.push(l.ingredientId);
        continue;
      }
      const used = (l.quantity / r.yieldQty) * o.count;
      const w = l.wastePct ?? m.wastePct;
      const cur = need.get(l.ingredientId) ?? { used: 0, gross: 0, min: w, max: w };
      need.set(l.ingredientId, { used: cur.used + used, gross: cur.gross + used / (1 - w / 100), min: Math.min(cur.min, w), max: Math.max(cur.max, w) });
    }
  }

  const rows: PlanRow[] = [...need].map(([ingredientId, n]) => {
    const m = materials.get(ingredientId)!;
    const toBuy = counted(m.baseUnit) ? Math.ceil(round4(n.gross)) : Math.ceil(round4(n.gross) * 100) / 100;
    const packs = Object.entries(m.packSizes)
      .map(([unit, size]) => {
        const count = Math.ceil(round4(toBuy / size));
        return { unit, size, count, total: round4(count * size), spare: round4(count * size - toBuy) };
      })
      // Least left over, then fewer packs.
      .sort((a, b) => a.spare - b.spare || a.count - b.count);
    return {
      ingredientId,
      name: m.name,
      unit: m.baseUnit,
      used: round4(n.used),
      spoilage: { min: n.min, max: n.max },
      toBuy,
      packs,
      cost: m.unitCost == null ? null : Math.round(toBuy * m.unitCost * 100) / 100,
    };
  });
  rows.sort((a, b) => a.name.localeCompare(b.name));
  const totalCost = rows.some((r) => r.cost == null) ? null : Math.round(rows.reduce((s, r) => s + r.cost!, 0) * 100) / 100;
  return { rows, totalCost, missing };
}
