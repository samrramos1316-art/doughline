import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { isoDaysAgo } from "@/lib/dates/localDate";

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

// One ingredient inside one menu item, for the ingredient view.
export type Use = {
  menuItemId: string;
  menuItem: string;
  recipeId: string;
  recipe: string;
  price: number;
  qty: number; // per serving, in the ingredient's base unit
  cost: number | null; // per serving, today
  shareOfCost: number | null; // of the item's cost, 0–1
  pctOfPrice: number | null; // share of the selling price it takes
  marginPct: number | null; // the item's margin today
  impact30d: number | null; // margin points lost (−) or won (+) to this ingredient's price move over 30 days
};

// Every ingredient, useful with or without recipes: what it costs, how the
// price moved, what you've spent on it (from matched invoice lines), and —
// when it's in a recipe — what it costs each menu item.
export type IngredientMargin = {
  id: string;
  name: string;
  unit: string;
  costNow: number | null;
  change30dPct: number | null;
  change90dPct: number | null;
  spend30: number;
  spend90: number;
  history: { date: string; cost: number; vendor: string | null }[]; // newest first
  uses: Use[];
  otherRecipes: string[]; // in a recipe that isn't sold as an active menu item
  shareOfFoodCost: number; // of one of every costed item, 0–1
};

const round = (n: number, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp;

// The Margins tab: every active menu item's margin, worked out from its
// recipe, and the menu's total margin. Same costing as the menu_item_margins
// view: menu_items.servings_per_batch when set, otherwise the recipe's yield.
export async function getMargins(supabase: Client, orgId: string) {
  const since30 = isoDaysAgo(30);
  const since90 = isoDaysAgo(90);
  const [org, menuItems, recipes, recipeIngredients, ingredients, history, lines] = await Promise.all([
    supabase.from("organizations").select("target_margin_pct").eq("id", orgId).single(),
    supabase.from("menu_items").select("id, name, selling_price, recipe_id, servings_per_batch").eq("is_active", true).order("name"),
    supabase.from("recipes").select("id, name, batch_yield_qty, batch_yield_unit"),
    supabase.from("recipe_ingredients").select("recipe_id, ingredient_id, quantity"),
    supabase.from("ingredients").select("id, name, base_unit, current_unit_cost").order("name"),
    supabase.from("ingredient_price_history").select("ingredient_id, unit_cost, effective_date, created_at, vendors(name)").order("effective_date").order("created_at"),
    supabase
      .from("invoice_line_items")
      .select("matched_ingredient_id, parsed_line_total, parsed_quantity, parsed_unit_cost, invoices!inner(invoice_date, created_at, status)")
      .not("matched_ingredient_id", "is", null)
      .neq("invoices.status", "failed"),
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

  // ---- by ingredient ------------------------------------------------------
  const histByIng = new Map<string, { date: string; cost: number; vendor: string | null }[]>();
  for (const h of history.data ?? []) {
    histByIng.set(h.ingredient_id, [...(histByIng.get(h.ingredient_id) ?? []), { date: h.effective_date, cost: Number(h.unit_cost), vendor: h.vendors?.name ?? null }]);
  }
  const costOn = (id: string, date: string) => {
    let found: number | null = null;
    for (const h of histByIng.get(id) ?? []) if (h.date <= date) found = h.cost;
    return found;
  };
  const spend = new Map<string, { d30: number; d90: number }>();
  for (const l of lines.data ?? []) {
    const date = l.invoices.invoice_date ?? l.invoices.created_at.slice(0, 10);
    if (date < since90) continue;
    const amount = l.parsed_line_total != null ? Number(l.parsed_line_total) : l.parsed_quantity != null && l.parsed_unit_cost != null ? Number(l.parsed_quantity) * Number(l.parsed_unit_cost) : 0;
    const cur = spend.get(l.matched_ingredient_id!) ?? { d30: 0, d90: 0 };
    cur.d90 += amount;
    if (date >= since30) cur.d30 += amount;
    spend.set(l.matched_ingredient_id!, cur);
  }
  const usesByIng = new Map<string, Use[]>();
  const soldRecipes = new Set<string>();
  for (const m of items) {
    if (!m.recipeId || !m.servings) continue;
    soldRecipes.add(m.recipeId);
    for (const p of m.parts) {
      const then = costOn(p.ingredientId, since30);
      usesByIng.set(p.ingredientId, [
        ...(usesByIng.get(p.ingredientId) ?? []),
        {
          menuItemId: m.id,
          menuItem: m.name,
          recipeId: m.recipeId,
          recipe: m.recipe ?? "",
          price: m.price,
          qty: p.qty,
          cost: p.cost,
          shareOfCost: p.shareOfCost,
          pctOfPrice: p.cost != null && m.price > 0 ? (p.cost / m.price) * 100 : null,
          marginPct: m.marginPct,
          impact30d: p.unitCost != null && then != null && m.price > 0 ? -((p.qty * (p.unitCost - then)) / m.price) * 100 : null,
        },
      ]);
    }
  }
  const recipesUsing = new Map<string, Set<string>>();
  for (const [recipeId, ls] of linesByRecipe) for (const l of ls) recipesUsing.set(l.ingredient_id, (recipesUsing.get(l.ingredient_id) ?? new Set()).add(recipeId));
  const pctChange = (now: number | null, then: number | null) => (now != null && then ? round(((now - then) / then) * 100, 1) : null);
  const byIngredient: IngredientMargin[] = (ingredients.data ?? []).map((i) => {
    const now = i.current_unit_cost == null ? null : Number(i.current_unit_cost);
    const hs = histByIng.get(i.id) ?? [];
    const uses = (usesByIng.get(i.id) ?? []).sort((a, b) => (b.pctOfPrice ?? -1) - (a.pctOfPrice ?? -1));
    // Only fully costed items, so shares line up with the total's food cost.
    const perRound = uses.filter((u) => u.marginPct != null).reduce((x, u) => x + (u.cost ?? 0), 0);
    return {
      id: i.id,
      name: i.name,
      unit: i.base_unit,
      costNow: now,
      change30dPct: pctChange(now, costOn(i.id, since30)),
      change90dPct: hs.length < 2 ? null : pctChange(now, costOn(i.id, since90) ?? hs[0].cost),
      spend30: spend.get(i.id)?.d30 ?? 0,
      spend90: spend.get(i.id)?.d90 ?? 0,
      history: [...hs].reverse().slice(0, 6),
      uses,
      otherRecipes: [...(recipesUsing.get(i.id) ?? [])].filter((r) => !soldRecipes.has(r)).map((r) => recipeById.get(r)?.name ?? "?"),
      shareOfFoodCost: total.foodCost > 0 ? perRound / total.foodCost : 0,
    };
  });
  // What matters most first: money spent on it, then its weight in the menu, then name.
  byIngredient.sort((a, b) => b.spend90 - a.spend90 || b.shareOfFoodCost - a.shareOfFoodCost || a.name.localeCompare(b.name));

  return { target, items, total, byIngredient };
}

export type Margins = Awaited<ReturnType<typeof getMargins>>;
