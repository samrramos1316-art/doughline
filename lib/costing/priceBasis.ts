// Price basis for quotes (docs: jewelry "metal price basis toggle: price paid
// at purchase vs. today's price (replacement cost)"). With no licensed live
// metal price yet (§14.3), "today's price" is the latest price on your
// invoices — current_unit_cost, what restocking costs — and "price paid" is
// the average of what you paid over the last six months, closer to what the
// metal already on the bench cost you.
// Pure: no I/O, so it runs under `node --test` as is.
import { sameUnit } from "./units.ts";

export type PriceBasis = "latest" | "average";
export const AVERAGE_WINDOW_DAYS = 182;

export type PricePoint = { unit_cost: number | string; unit: string; effective_date: string };

// The plain average of the prices recorded since `sinceIso`, in the
// material's current base unit. Each purchase counts once: history
// quantities are in invoice units (a case, a bag), which don't compare
// across purchases. Prices recorded in another unit — before the base unit
// changed — are left out. null when there are none.
export function averagePaid(points: PricePoint[], baseUnit: string, sinceIso: string): { avg: number; count: number } | null {
  const usable = points.filter((p) => p.effective_date >= sinceIso && sameUnit(p.unit, baseUnit) && Number.isFinite(Number(p.unit_cost)));
  if (!usable.length) return null;
  const avg = usable.reduce((s, p) => s + Number(p.unit_cost), 0) / usable.length;
  return { avg: Math.round(avg * 1e8) / 1e8, count: usable.length };
}

// The unit cost a quote uses for a material under the chosen basis: the
// average when asked for and known, else the latest price.
export function costOnBasis(basis: PriceBasis, latest: number | null, average: number | null): number | null {
  return basis === "average" && average != null ? average : latest;
}
