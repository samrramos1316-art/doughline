import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Client = SupabaseClient<Database>;

// One ingredient line of an item's recipe, worked through to a cost per
// serving: batch amount ÷ servings per batch × price per unit.
export type Part = {
  ingredientId: string;
  name: string;
  unit: string;
  batchQty: number; // in the recipe, per batch (repeated lines merged)
  qty: number; // per serving
  unitCost: number | null; // price per unit today
  cost: number | null; // per serving
  shareOfCost: number | null; // of the item's cost, 0–1
};

export type ItemMargin = {
  id: string;
  name: string;
  recipeId: string | null;
  recipe: string | null;
  servings: number | null;
  servingsFromMenu: boolean; // servings_per_batch set on the item, not the recipe's yield
  yieldUnit: string | null;
  price: number;
  cost: number | null; // null until every ingredient has a price
  knownCost: number; // what the priced ingredients add up to so far
  profit: number | null;
  marginPct: number | null;
  parts: Part[];
  unpriced: string[];
};

const round = (n: number, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp;

// The Margins tab: every active menu item's margin, worked out from its
// recipe, and the menu's total margin. Same costing as the menu_item_margins
// view: menu_items.servings_per_batch when set, otherwise the recipe's yield.
export async function getMargins(supabase: Client, orgId: string) {
  const [org, menuItems, recipes, recipeIngredients, ingredients] = await Promise.all([
    supabase.from("organizations").select("target_margin_pct").eq("id", orgId).single(),
    supabase.from("menu_items").select("id, name, selling_price, recipe_id, servings_per_batch").eq("is_active", true).order("name"),
    supabase.from("recipes").select("id, name, batch_yield_qty, batch_yield_unit"),
    supabase.from("recipe_ingredients").select("recipe_id, ingredient_id, quantity"),
    supabase.from("ingredients").select("id, name, base_unit, current_unit_cost"),
  ]);
  const target = Number(org.data?.target_margin_pct ?? 65);
  const recipeById = new Map((recipes.data ?? []).map((r) => [r.id, r]));
  const ingById = new Map((ingredients.data ?? []).map((i) => [i.id, i]));
  const linesByRecipe = new Map<string, { ingredient_id: string; quantity: number }[]>();
  for (const l of recipeIngredients.data ?? []) {
    linesByRecipe.set(l.recipe_id, [...(linesByRecipe.get(l.recipe_id) ?? []), { ingredient_id: l.ingredient_id, quantity: Number(l.quantity) }]);
  }

  const items: ItemMargin[] = (menuItems.data ?? []).map((m) => {
    const recipe = m.recipe_id ? recipeById.get(m.recipe_id) : undefined;
    const servingsRaw = m.servings_per_batch ?? recipe?.batch_yield_qty ?? null;
    const servings = servingsRaw == null || Number(servingsRaw) <= 0 ? null : Number(servingsRaw);
    const price = Number(m.selling_price);
    // Merge repeated lines for one ingredient (flour in the dough and for dusting).
    const perIng = new Map<string, number>();
    for (const l of (recipe && linesByRecipe.get(recipe.id)) || []) perIng.set(l.ingredient_id, (perIng.get(l.ingredient_id) ?? 0) + l.quantity);
    const parts: Part[] = [...perIng.entries()].map(([id, batchQty]) => {
      const ing = ingById.get(id);
      const unitCost = ing?.current_unit_cost == null ? null : Number(ing.current_unit_cost);
      const qty = servings ? batchQty / servings : 0;
      return { ingredientId: id, name: ing?.name ?? "?", unit: ing?.base_unit ?? "", batchQty, qty, unitCost, cost: unitCost == null || !servings ? null : qty * unitCost, shareOfCost: null };
    });
    const unpriced = parts.filter((p) => p.unitCost == null).map((p) => p.name);
    const knownCost = parts.reduce((s, p) => s + (p.cost ?? 0), 0);
    const cost = parts.length && servings && !unpriced.length ? knownCost : null;
    for (const p of parts) p.shareOfCost = cost && p.cost != null ? p.cost / cost : null;
    parts.sort((a, b) => (b.cost ?? -1) - (a.cost ?? -1));
    return {
      id: m.id,
      name: m.name,
      recipeId: recipe?.id ?? null,
      recipe: recipe?.name ?? null,
      servings,
      servingsFromMenu: m.servings_per_batch != null,
      yieldUnit: recipe?.batch_yield_unit ?? null,
      price,
      cost,
      knownCost,
      profit: cost == null ? null : price - cost,
      marginPct: cost == null || price <= 0 ? null : round(((price - cost) / price) * 100),
      parts,
      unpriced,
    };
  });

  // The menu's total: sell one of every costed item, what's left after food cost.
  const costed = items.filter((i) => i.cost != null && i.price > 0);
  const sales = costed.reduce((s, i) => s + i.price, 0);
  const foodCost = costed.reduce((s, i) => s + i.cost!, 0);
  const total = {
    items: costed.length,
    sales,
    foodCost,
    profit: sales - foodCost,
    marginPct: sales > 0 ? round(((sales - foodCost) / sales) * 100) : null,
  };

  return { target, items, total };
}

export type Margins = Awaited<ReturnType<typeof getMargins>>;
