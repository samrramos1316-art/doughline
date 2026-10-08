import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { batchCost, effectiveWastePct, marginPctOf } from "./recipeCost";

export type MarginHistoryPoint = {
  date: string;
  costPerServing: number;
  marginPct: number | null;
};

// §3.9: no margin_snapshots table to keep in sync — a menu item's margin
// history is computed on demand by merging each ingredient's
// ingredient_price_history timeline and re-evaluating the margin formula at
// every date any of them changed. Keeps the DB lean and the chart never
// stale, at the cost of a slightly heavier read (fine at this app's volume:
// a handful of ingredients per recipe, a few dozen price changes a year).
export async function getMenuItemMarginHistory(
  supabase: SupabaseClient<Database>,
  menuItemId: string,
): Promise<MarginHistoryPoint[]> {
  const { data: menuItem } = await supabase
    .from("menu_items")
    .select("selling_price, recipe_id, servings_per_batch")
    .eq("id", menuItemId)
    .single();
  if (!menuItem?.recipe_id) return [];

  const { data: recipe } = await supabase
    .from("recipes")
    .select("batch_yield_qty, labor_minutes, labor_rate_per_hour, overhead_pct, organizations(default_labor_rate_per_hour)")
    .eq("id", menuItem.recipe_id)
    .single();
  if (!recipe) return [];

  const { data: recipeIngredients } = await supabase
    .from("recipe_ingredients")
    .select("ingredient_id, quantity, waste_pct, ingredients(waste_pct)")
    .eq("recipe_id", menuItem.recipe_id);
  if (!recipeIngredients || recipeIngredients.length === 0) return [];

  const ingredientIds = recipeIngredients.map((ri) => ri.ingredient_id);

  const { data: priceHistory } = await supabase
    .from("ingredient_price_history")
    .select("ingredient_id, unit_cost, effective_date")
    .in("ingredient_id", ingredientIds)
    .order("effective_date", { ascending: true });
  if (!priceHistory || priceHistory.length === 0) return [];

  const changeDates = [...new Set(priceHistory.map((p) => p.effective_date))].sort();
  const sellingPrice = Number(menuItem.selling_price);
  // Same divisor as the menu_item_margins view (migration 014): the menu
  // item's own servings_per_batch override, else the recipe's yield.
  const servingsPerBatch = Number(menuItem.servings_per_batch ?? recipe.batch_yield_qty);

  // Waste, labor and overhead as the recipe has them now (lib/costing/recipeCost.ts).
  const laborOverhead = {
    laborMinutes: Number(recipe.labor_minutes),
    laborRatePerHour: recipe.labor_rate_per_hour == null ? null : Number(recipe.labor_rate_per_hour),
    defaultLaborRatePerHour: Number(recipe.organizations?.default_labor_rate_per_hour ?? 0),
    overheadPct: Number(recipe.overhead_pct),
  };

  return changeDates.map((date) => {
    // An ingredient with no price yet on this date is left out, as before.
    const lines = recipeIngredients.flatMap((ri) => {
      const pricesOnOrBefore = priceHistory.filter(
        (p) => p.ingredient_id === ri.ingredient_id && p.effective_date <= date,
      );
      const latest = pricesOnOrBefore[pricesOnOrBefore.length - 1];
      return latest ? [{ quantity: Number(ri.quantity), unitCost: Number(latest.unit_cost), wastePct: effectiveWastePct(ri.waste_pct, ri.ingredients?.waste_pct) }] : [];
    });

    const costPerServing = (batchCost(lines, laborOverhead)?.total ?? 0) / servingsPerBatch;
    const marginPct = marginPctOf(sellingPrice, costPerServing);

    return { date, costPerServing, marginPct };
  });
}
