import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { isoDaysAgo } from "@/lib/dates/localDate";

type Client = SupabaseClient<Database>;

// One ingredient inside one menu item: how much of it a serving uses and
// what that costs, as a share of the item's cost and of its selling price.
export type Use = {
  menuItemId: string;
  menuItem: string;
  recipeId: string;
  recipe: string;
  price: number;
  qty: number; // per serving, in the ingredient's base unit
  cost: number | null; // per serving, today
  shareOfCost: number | null; // of the item's food cost, 0–1
  pctOfPrice: number | null; // margin points this ingredient takes
  marginPct: number | null; // the item's margin today
  impact30d: number | null; // margin points lost (−) or won (+) to this ingredient's price move over 30 days
};

export type IngredientMargin = {
  id: string;
  name: string;
  unit: string;
  costNow: number | null;
  cost30dAgo: number | null;
  change30dPct: number | null;
  uses: Use[];
  otherRecipes: string[]; // recipes that use it but aren't sold as an active menu item
  perRound: number; // cost in one of every active menu item
  shareOfFoodCost: number; // perRound / the same total across all ingredients
};

export type ItemMargin = {
  id: string;
  name: string;
  recipeId: string | null;
  recipe: string | null;
  price: number;
  cost: number | null;
  marginPct: number | null;
  parts: { ingredientId: string; name: string; unit: string; qty: number; cost: number | null; shareOfCost: number | null }[];
  unpriced: string[];
};

const round = (n: number, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp;

// The Margins tab: every active menu item's food cost, split by ingredient,
// read both ways — by ingredient (where a price rise hurts) and by item
// (what each one is made of). Same costing as the menu_item_margins view
// and lib/dashboard/overview.ts: menu_items.servings_per_batch when set,
// otherwise the recipe's yield.
export async function getMargins(supabase: Client, orgId: string) {
  const since30 = isoDaysAgo(30);
  const [org, menuItems, recipes, recipeIngredients, ingredients, history] = await Promise.all([
    supabase.from("organizations").select("target_margin_pct").eq("id", orgId).single(),
    supabase.from("menu_items").select("id, name, selling_price, recipe_id, servings_per_batch, is_active").eq("is_active", true).order("name"),
    supabase.from("recipes").select("id, name, batch_yield_qty"),
    supabase.from("recipe_ingredients").select("recipe_id, ingredient_id, quantity"),
    supabase.from("ingredients").select("id, name, base_unit, current_unit_cost").order("name"),
    supabase.from("ingredient_price_history").select("ingredient_id, unit_cost, effective_date, created_at").order("effective_date").order("created_at"),
  ]);
  const target = Number(org.data?.target_margin_pct ?? 65);
  const recipeById = new Map((recipes.data ?? []).map((r) => [r.id, r]));
  const ingById = new Map((ingredients.data ?? []).map((i) => [i.id, i]));
  const linesByRecipe = new Map<string, { ingredient_id: string; quantity: number }[]>();
  for (const l of recipeIngredients.data ?? []) {
    linesByRecipe.set(l.recipe_id, [...(linesByRecipe.get(l.recipe_id) ?? []), { ingredient_id: l.ingredient_id, quantity: Number(l.quantity) }]);
  }
  const histByIng = new Map<string, { date: string; cost: number }[]>();
  for (const h of history.data ?? []) histByIng.set(h.ingredient_id, [...(histByIng.get(h.ingredient_id) ?? []), { date: h.effective_date, cost: Number(h.unit_cost) }]);
  const costNow = (id: string) => {
    const c = ingById.get(id)?.current_unit_cost;
    return c == null ? null : Number(c);
  };
  const costOn = (id: string, date: string) => {
    let found: number | null = null;
    for (const h of histByIng.get(id) ?? []) if (h.date <= date) found = h.cost;
    return found;
  };

  const items: ItemMargin[] = [];
  const usesByIng = new Map<string, Use[]>();
  const soldRecipes = new Set<string>();
  for (const m of menuItems.data ?? []) {
    const recipe = m.recipe_id ? recipeById.get(m.recipe_id) : undefined;
    const lines = (m.recipe_id && linesByRecipe.get(m.recipe_id)) || [];
    const servings = Number(m.servings_per_batch ?? recipe?.batch_yield_qty ?? 0);
    const price = Number(m.selling_price);
    if (recipe) soldRecipes.add(recipe.id);
    // Merge repeated lines for one ingredient (flour in the dough and the dusting).
    const perIng = new Map<string, number>();
    for (const l of lines) perIng.set(l.ingredient_id, (perIng.get(l.ingredient_id) ?? 0) + l.quantity);
    const parts = [...perIng.entries()].map(([id, batchQty]) => {
      const qty = servings ? batchQty / servings : 0;
      const c = costNow(id);
      return { ingredientId: id, name: ingById.get(id)?.name ?? "?", unit: ingById.get(id)?.base_unit ?? "", qty, cost: c == null || !servings ? null : qty * c, shareOfCost: null as number | null };
    });
    const unpriced = parts.filter((p) => p.cost == null).map((p) => p.name);
    const cost = parts.length && servings && !unpriced.length ? parts.reduce((s, p) => s + p.cost!, 0) : null;
    for (const p of parts) p.shareOfCost = cost && p.cost != null ? p.cost / cost : null;
    parts.sort((a, b) => (b.cost ?? -1) - (a.cost ?? -1));
    const marginPct = cost == null || price <= 0 ? null : round(((price - cost) / price) * 100);
    items.push({ id: m.id, name: m.name, recipeId: recipe?.id ?? null, recipe: recipe?.name ?? null, price, cost, marginPct, parts, unpriced });
    if (!recipe) continue;
    for (const p of parts) {
      const then = costOn(p.ingredientId, since30);
      const now = costNow(p.ingredientId);
      usesByIng.set(p.ingredientId, [
        ...(usesByIng.get(p.ingredientId) ?? []),
        {
          menuItemId: m.id,
          menuItem: m.name,
          recipeId: recipe.id,
          recipe: recipe.name,
          price,
          qty: p.qty,
          cost: p.cost,
          shareOfCost: p.shareOfCost,
          pctOfPrice: p.cost != null && price > 0 ? (p.cost / price) * 100 : null,
          marginPct,
          impact30d: now != null && then != null && price > 0 && servings ? -((p.qty * (now - then)) / price) * 100 : null,
        },
      ]);
    }
  }

  const recipesUsing = new Map<string, Set<string>>();
  for (const [recipeId, lines] of linesByRecipe) {
    for (const l of lines) recipesUsing.set(l.ingredient_id, (recipesUsing.get(l.ingredient_id) ?? new Set()).add(recipeId));
  }
  const byIngredient: IngredientMargin[] = (ingredients.data ?? []).map((i) => {
    const uses = (usesByIng.get(i.id) ?? []).sort((a, b) => (b.pctOfPrice ?? -1) - (a.pctOfPrice ?? -1));
    const now = costNow(i.id);
    const then = costOn(i.id, since30);
    return {
      id: i.id,
      name: i.name,
      unit: i.base_unit,
      costNow: now,
      cost30dAgo: then,
      change30dPct: now != null && then ? round(((now - then) / then) * 100, 1) : null,
      uses,
      otherRecipes: [...(recipesUsing.get(i.id) ?? [])].filter((r) => !soldRecipes.has(r)).map((r) => recipeById.get(r)?.name ?? "?"),
      perRound: uses.reduce((s, u) => s + (u.cost ?? 0), 0),
      shareOfFoodCost: 0,
    };
  });
  const total = byIngredient.reduce((s, i) => s + i.perRound, 0);
  for (const i of byIngredient) i.shareOfFoodCost = total ? i.perRound / total : 0;
  byIngredient.sort((a, b) => b.perRound - a.perRound || b.uses.length - a.uses.length || a.name.localeCompare(b.name));

  return { target, byIngredient, items, foodCostPerRound: total };
}

export type Margins = Awaited<ReturnType<typeof getMargins>>;
