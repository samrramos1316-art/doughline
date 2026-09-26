import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

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
    .select("selling_price, recipe_id")
    .eq("id", menuItemId)
    .single();
  if (!menuItem?.recipe_id) return [];

  const { data: recipe } = await supabase
    .from("recipes")
    .select("batch_yield_qty")
    .eq("id", menuItem.recipe_id)
    .single();
  if (!recipe) return [];

  const { data: recipeIngredients } = await supabase
    .from("recipe_ingredients")
    .select("ingredient_id, quantity")
    .eq("recipe_id", menuItem.recipe_id);
  if (!recipeIngredients || recipeIngredients.length === 0) return [];

  const ingredientIds = recipeIngredients.map((ri) => ri.ingredient_id);

  const { data: priceHistory } = await supabase
    .from("ingredient_price_history")
    .select("ingredient_id, unit_cost, effective_date")
    .in("ingredient_id", ingredientIds)
    .order("effective_date", { ascending: true });
  if (!priceHistory || priceHistory.length === 0) return [];

  const quantityByIngredient = new Map(
    recipeIngredients.map((ri) => [ri.ingredient_id, Number(ri.quantity)]),
  );
  const changeDates = [...new Set(priceHistory.map((p) => p.effective_date))].sort();
  const sellingPrice = Number(menuItem.selling_price);
  const batchYieldQty = Number(recipe.batch_yield_qty);

  return changeDates.map((date) => {
    let batchTotalCost = 0;
    for (const ingredientId of ingredientIds) {
      const quantity = quantityByIngredient.get(ingredientId) ?? 0;
      const pricesOnOrBefore = priceHistory.filter(
        (p) => p.ingredient_id === ingredientId && p.effective_date <= date,
      );
      const latest = pricesOnOrBefore[pricesOnOrBefore.length - 1];
      if (latest) batchTotalCost += quantity * Number(latest.unit_cost);
    }

    const costPerServing = batchTotalCost / batchYieldQty;
    const marginPct =
      sellingPrice > 0
        ? Math.round(((sellingPrice - costPerServing) / sellingPrice) * 100 * 100) / 100
        : null;

    return { date, costPerServing, marginPct };
  });
}
