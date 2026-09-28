import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { suggestForItem, type ItemSuggestion } from "./math";

type Client = SupabaseClient<Database>;

export type AlertSuggestionItem = ItemSuggestion & {
  menu_item_id: string;
  menu_item_name: string;
  recipe_name: string;
  selling_price: number;
  cost_per_serving: number;
  previous_margin_pct: number; // at the moment of the price change (§6.2)
  new_margin_pct: number; // ditto
  ingredient_qty_per_batch: number;
};

export type AlertSuggestions = {
  alert: {
    id: string;
    ingredient_id: string;
    ingredient_name: string;
    base_unit: string;
    previous_unit_cost: number;
    new_unit_cost: number;
    pct_change: number;
    created_at: string;
    ai_narrative: string | null;
    ai_narrative_model: string | null;
    ai_narrative_generated_at: string | null;
  };
  target_margin_pct: number;
  items: AlertSuggestionItem[];
};

// §8: turn an alert's menu_item_margin_impacts into concrete options, one
// set per affected menu item. The before/after margins are the snapshot
// from the moment of the price change; the suggestions are computed on the
// *current* price, costs and recipe (live menu_item_margins view), so they
// stay right if the owner has already changed something since.
export async function getAlertSuggestions(supabase: Client, alertId: string): Promise<AlertSuggestions | null> {
  const { data: alert, error } = await supabase
    .from("price_alerts")
    .select(
      "id, org_id, ingredient_id, previous_unit_cost, new_unit_cost, pct_change, created_at, ai_narrative, ai_narrative_model, ai_narrative_generated_at, ingredients(name, base_unit, current_unit_cost), menu_item_margin_impacts(menu_item_id, recipe_id, previous_margin_pct, new_margin_pct)",
    )
    .eq("id", alertId)
    .maybeSingle();
  if (error) throw new Error("loading alert failed: " + error.message);
  if (!alert || !alert.ingredients) return null;

  const impacts = alert.menu_item_margin_impacts;
  const menuItemIds = impacts.map((i) => i.menu_item_id);
  const recipeIds = [...new Set(impacts.map((i) => i.recipe_id))];

  const [{ data: org }, { data: menuItems }, { data: margins }, { data: recipes }, { data: recipeIngs }] =
    await Promise.all([
      supabase.from("organizations").select("target_margin_pct").eq("id", alert.org_id).single(),
      supabase.from("menu_items").select("id, name, selling_price, servings_per_batch").in("id", menuItemIds),
      supabase.from("menu_item_margins").select("menu_item_id, cost_per_serving").in("menu_item_id", menuItemIds),
      supabase.from("recipes").select("id, name, batch_yield_qty").in("id", recipeIds),
      supabase
        .from("recipe_ingredients")
        .select("recipe_id, quantity")
        .eq("ingredient_id", alert.ingredient_id)
        .in("recipe_id", recipeIds),
    ]);
  if (!org) throw new Error("loading org target margin failed");

  const target = Number(org.target_margin_pct);
  const ingredientCost = Number(alert.ingredients.current_unit_cost);
  const items: AlertSuggestionItem[] = [];

  for (const impact of impacts) {
    const mi = menuItems?.find((m) => m.id === impact.menu_item_id);
    const recipe = recipes?.find((r) => r.id === impact.recipe_id);
    const cps = margins?.find((m) => m.menu_item_id === impact.menu_item_id)?.cost_per_serving;
    // Item or recipe deleted since the alert, or a cost that was/is unknown
    // (an unpriced ingredient, migration 023): nothing to compute from.
    if (!mi || !recipe || cps == null || impact.previous_margin_pct == null) continue;
    // A recipe can list the same ingredient on more than one line.
    const qty = (recipeIngs ?? [])
      .filter((ri) => ri.recipe_id === recipe.id)
      .reduce((sum, ri) => sum + Number(ri.quantity), 0);

    const s = suggestForItem({
      sellingPrice: Number(mi.selling_price),
      costPerServing: Number(cps),
      servingsPerBatch: Number(mi.servings_per_batch ?? recipe.batch_yield_qty),
      previousMarginPct: Number(impact.previous_margin_pct),
      targetMarginPct: target,
      ingredientQtyPerBatch: qty,
      ingredientUnitCost: ingredientCost,
      baseUnit: alert.ingredients.base_unit,
    });

    items.push({
      ...s,
      menu_item_id: mi.id,
      menu_item_name: mi.name,
      recipe_name: recipe.name,
      selling_price: Number(mi.selling_price),
      cost_per_serving: Number(cps),
      previous_margin_pct: Number(impact.previous_margin_pct),
      new_margin_pct: Number(impact.new_margin_pct),
      ingredient_qty_per_batch: qty,
    });
  }

  // Biggest margin drop first.
  items.sort((a, b) => a.new_margin_pct - a.previous_margin_pct - (b.new_margin_pct - b.previous_margin_pct));

  return {
    alert: {
      id: alert.id,
      ingredient_id: alert.ingredient_id,
      ingredient_name: alert.ingredients.name,
      base_unit: alert.ingredients.base_unit,
      previous_unit_cost: Number(alert.previous_unit_cost),
      new_unit_cost: Number(alert.new_unit_cost),
      pct_change: Number(alert.pct_change),
      created_at: alert.created_at,
      ai_narrative: alert.ai_narrative,
      ai_narrative_model: alert.ai_narrative_model,
      ai_narrative_generated_at: alert.ai_narrative_generated_at,
    },
    target_margin_pct: target,
    items,
  };
}
