// The recipe cost formula — the same one as the recipe_costs view (migration
// 025). Everything in the app that costs a recipe itself (dashboard history,
// the Margins tab, the alert suggestions) goes through here, so it agrees
// with the views and with the before/after numbers the price cascade
// records. Pure: no I/O, no imports, so it runs under `node --test` as is.
//
// Per recipe batch:
//   materials = Σ quantity / (1 − waste_pct/100) × unit cost
//               (waste_pct = the line's own %, else the material's; 027)
//   labor     = labor_minutes × (recipe rate ?? org default rate) / 60
//   machine   = machine_minutes × (recipe machine rate ?? org default) / 60 (029)
//   total     = (materials + labor + machine) × (1 + overhead_pct/100)

export type CostLine = {
  quantity: number; // in the ingredient's base unit
  unitCost: number | null; // per base unit; null = no price yet
  wastePct?: number | null; // share bought but lost (trim, scrap, breakage), 0–<100
};

export type LaborOverhead = {
  laborMinutes?: number | null; // per batch
  laborRatePerHour?: number | null; // the recipe's own rate; null = the org default
  defaultLaborRatePerHour?: number | null; // organizations.default_labor_rate_per_hour
  overheadPct?: number | null; // on top of materials + labor (+ machine)
  // Machine time (migration 029): separate from hands-on labor.
  machineMinutes?: number | null; // per batch
  machineRatePerHour?: number | null; // the recipe's own; null = the org default
  defaultMachineRatePerHour?: number | null; // organizations.default_machine_rate_per_hour
};

export type BatchCost = { materials: number; labor: number; machine: number; overhead: number; total: number };

// A recipe row + its org's defaults → the formula's inputs. Numeric columns
// arrive as strings or numbers; missing ones are 0 / the default.
type RecipeRow = {
  labor_minutes?: number | string | null;
  labor_rate_per_hour?: number | string | null;
  overhead_pct?: number | string | null;
  machine_minutes?: number | string | null;
  machine_rate_per_hour?: number | string | null;
};
type OrgDefaults = { default_labor_rate_per_hour?: number | string | null; default_machine_rate_per_hour?: number | string | null } | null | undefined;
export type RecipeLaborOverhead = {
  laborMinutes: number;
  laborRatePerHour: number | null;
  defaultLaborRatePerHour: number;
  overheadPct: number;
  machineMinutes: number;
  machineRatePerHour: number | null;
  defaultMachineRatePerHour: number;
};
export function laborOverheadOf(r: RecipeRow | null | undefined, org: OrgDefaults): RecipeLaborOverhead {
  const n = (v: number | string | null | undefined) => (v == null ? null : Number(v));
  return {
    laborMinutes: Number(r?.labor_minutes ?? 0),
    laborRatePerHour: n(r?.labor_rate_per_hour),
    defaultLaborRatePerHour: Number(org?.default_labor_rate_per_hour ?? 0),
    overheadPct: Number(r?.overhead_pct ?? 0),
    machineMinutes: Number(r?.machine_minutes ?? 0),
    machineRatePerHour: n(r?.machine_rate_per_hour),
    defaultMachineRatePerHour: Number(org?.default_machine_rate_per_hour ?? 0),
  };
}

const num = (n: number | null | undefined) => (n == null || !Number.isFinite(Number(n)) ? 0 : Number(n));

// A line's waste: its own % when set, else its material's (migration 027 —
// recipe_ingredients.waste_pct null = ingredients.waste_pct).
export function effectiveWastePct(lineWastePct: number | string | null | undefined, materialWastePct: number | string | null | undefined): number {
  return lineWastePct != null ? num(Number(lineWastePct)) : num(Number(materialWastePct ?? 0));
}

// How much has to be bought for `quantity` to end up in the batch: 10% waste
// means 1 kg used costs 1/0.9 kg bought.
export function wasteMultiplier(wastePct: number | null | undefined): number {
  const w = num(wastePct);
  return w > 0 && w < 100 ? 1 / (1 - w / 100) : 1;
}

export function lineCost(quantity: number, unitCost: number, wastePct?: number | null): number {
  const w = num(wastePct);
  // No waste: quantity × cost and nothing else, like the view, so untouched
  // recipes cost exactly what they always did.
  return w > 0 && w < 100 ? (quantity / (1 - w / 100)) * unitCost : quantity * unitCost;
}

export function laborRate(x: LaborOverhead): number {
  return x.laborRatePerHour != null ? num(x.laborRatePerHour) : num(x.defaultLaborRatePerHour);
}

export function laborCost(x: LaborOverhead): number {
  return (num(x.laborMinutes) * laborRate(x)) / 60;
}

export function machineRate(x: LaborOverhead): number {
  return x.machineRatePerHour != null ? num(x.machineRatePerHour) : num(x.defaultMachineRatePerHour);
}

export function machineCost(x: LaborOverhead): number {
  return (num(x.machineMinutes) * machineRate(x)) / 60;
}

// Multiplier for overhead on top of materials + labor (5% → 1.05).
export function overheadMultiplier(overheadPct: number | null | undefined): number {
  return 1 + num(overheadPct) / 100;
}

// One batch's cost, or null when it can't be known: no ingredient lines (the
// view has no row for such a recipe), or any line without a price
// (migration 023 — an unpriced ingredient is not free).
export function batchCost(lines: CostLine[], x: LaborOverhead = {}): BatchCost | null {
  if (!lines.length || lines.some((l) => l.unitCost == null)) return null;
  const materials = lines.reduce((s, l) => s + lineCost(l.quantity, l.unitCost!, l.wastePct), 0);
  const labor = laborCost(x);
  const machine = machineCost(x);
  const overheadPct = num(x.overheadPct);
  if (labor === 0 && machine === 0 && overheadPct === 0) return { materials, labor: 0, machine: 0, overhead: 0, total: materials };
  const total = (materials + labor + machine) * overheadMultiplier(overheadPct);
  return { materials, labor, machine, overhead: total - materials - labor - machine, total };
}

export function perServing(cost: number | null, servings: number | null | undefined): number | null {
  return cost == null || !servings || servings <= 0 ? null : cost / servings;
}

// Same rounding as the view: percent of the selling price, 2 decimals.
export function marginPctOf(price: number, costPerServing: number | null): number | null {
  if (costPerServing == null || !(price > 0)) return null;
  return Math.round(((price - costPerServing) / price) * 100 * 100) / 100;
}

// What one more base unit of an ingredient adds to the batch total, waste
// and overhead included: the slope a portion change works against. Lines are
// that ingredient's lines in the recipe (it can appear more than once, each
// with its own waste); averaged by quantity.
export function effectiveUnitCost(
  unitCost: number,
  lines: { quantity: number; wastePct?: number | null }[],
  overheadPct?: number | null,
): number {
  const qty = lines.reduce((s, l) => s + l.quantity, 0);
  const weighted = qty > 0 ? lines.reduce((s, l) => s + l.quantity * wasteMultiplier(l.wastePct), 0) / qty : 1;
  return unitCost * weighted * overheadMultiplier(overheadPct);
}
