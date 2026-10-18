import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { cleanPackSizes, conversionFactor, packSizeFor, sameUnit, unitKey, type PackSizes } from "./units.ts";

// Recipe quantities and current_unit_cost are both in the ingredient's base
// unit (the costing views multiply them as they are). When the base unit
// changes to one it converts to (lb → oz), both are converted, so the
// ingredient costs what it did: 2 lb at $4/lb becomes 32 oz at $0.25/oz.
// A change with no fixed conversion (lb → case) needs a size — the
// material's case size, or one the owner gives — and is refused without one
// rather than leaving the price and amounts in the old unit.

// How many of the new unit are in one of the old (lb → oz = 16), or null
// when there's no fixed conversion (see unitChangeFactorWith).
export function unitChangeFactor(from: string | null | undefined, to: string | null | undefined): number | null {
  if (sameUnit(from, to)) return null;
  return conversionFactor(from, to);
}

// A change with no fixed conversion (lb → case) converts by a size: the one
// the owner gives (`given`: how many of the new unit are in one of the old),
// else the material's own pack size for the new unit (a case of 36 lb,
// stored as { case: 36 }). Null when neither says.
export function unitChangeFactorWith(
  from: string | null | undefined,
  to: string | null | undefined,
  packs: PackSizes,
  given?: number | null,
): number | null {
  if (sameUnit(from, to)) return null;
  const fixed = conversionFactor(from, to);
  if (fixed) return fixed;
  if (given != null && given > 0) return given;
  const size = packSizeFor(packs, to);
  return size ? 1 / size : null;
}

// True when a base unit change needs the owner to say how the units relate.
export function needsUnitSize(from: string | null | undefined, to: string | null | undefined, packs: PackSizes): boolean {
  return !sameUnit(from, to) && unitChangeFactorWith(from, to, packs) == null;
}

// Pack sizes after a base unit change. They count the base unit, so they
// scale; the new base unit's own entry goes (a case is 1 case); and after a
// change with no fixed conversion the old unit stays as a size, so invoices
// still priced per lb convert to the case ({ lb: 1/36 }).
export function packSizesAfterUnitChange(packs: PackSizes, factor: number, from: string, to: string): PackSizes {
  const out = rebasePackSizes(packs, factor);
  const toKey = unitKey(to);
  if (toKey) delete out[toKey];
  const fromKey = unitKey(from);
  if (fromKey && conversionFactor(from, to) == null) out[fromKey] = round8(factor);
  return out;
}

// The cost per new unit, at the column's 8 decimals (as invoice prices are).
export function rebaseCost(cost: number | null | undefined, factor: number): number | null {
  return cost == null ? null : round8(Number(cost) / factor);
}

// Pack sizes count the base unit (a box of 10 lb), so they scale with it.
export function rebasePackSizes(sizes: PackSizes, factor: number): PackSizes {
  return Object.fromEntries(Object.entries(sizes).map(([unit, n]) => [unit, round8(n * factor)]));
}

// Every recipe line of this ingredient, converted to the new base unit.
export async function rebaseRecipeLines(
  supabase: SupabaseClient<Database>,
  ingredientId: string,
  factor: number,
  newUnit: string,
): Promise<number> {
  const { data: lines, error } = await supabase.from("recipe_ingredients").select("id, quantity").eq("ingredient_id", ingredientId);
  if (error) throw new Error("loading recipe lines failed: " + error.message);
  for (const line of lines ?? []) {
    const { error: updateError } = await supabase
      .from("recipe_ingredients")
      .update({ quantity: round8(Number(line.quantity) * factor), unit: newUnit })
      .eq("id", line.id);
    if (updateError) throw new Error("converting a recipe line failed: " + updateError.message);
  }
  return lines?.length ?? 0;
}

// Recipe lines as saved: each in its ingredient's base unit, whatever unit
// it came in (8 oz of butter costed per lb is saved as 0.5 lb). A bunch or
// box converts by the material's own size. A unit that doesn't convert is
// refused, so a line can't be costed in the wrong unit.
type LineIn = { ingredient_id: string; quantity: number; unit: string };
type IngredientUnit = { id: string; name: string; base_unit: string; pack_sizes: unknown };

export function linesInBaseUnits<L extends LineIn>(lines: L[], ingredients: IngredientUnit[]): { lines: L[] } | { error: string } {
  const byId = new Map(ingredients.map((i) => [i.id, i]));
  const out: L[] = [];
  for (const line of lines) {
    const ing = byId.get(line.ingredient_id);
    if (!ing) return { error: "One of the ingredients wasn't found" };
    if (sameUnit(line.unit, ing.base_unit)) {
      out.push({ ...line, unit: ing.base_unit });
      continue;
    }
    const factor = conversionFactor(line.unit, ing.base_unit) ?? packSizeFor(cleanPackSizes(ing.pack_sizes), line.unit);
    if (!factor) return { error: `Can't use "${line.unit}" for ${ing.name}: it's costed per ${ing.base_unit}` };
    out.push({ ...line, quantity: round8(line.quantity * factor), unit: ing.base_unit });
  }
  return { lines: out };
}

export async function loadIngredientUnits(supabase: SupabaseClient<Database>, ids: string[]): Promise<IngredientUnit[]> {
  if (!ids.length) return [];
  const { data, error } = await supabase.from("ingredients").select("id, name, base_unit, pack_sizes").in("id", [...new Set(ids)]);
  if (error) throw new Error("loading ingredients failed: " + error.message);
  return data ?? [];
}

// Prices and recipe amounts are stored to 8 decimals (migration 031).
function round8(n: number) {
  return Math.round(n * 1e8) / 1e8;
}
