// §8 deterministic suggestions — pure math, no I/O, no AI.
//
// The goal margin for an item depends on where the alert left it:
//   - below the org's target → restore the target (§8's formula as written)
//   - still at/above target but lower than before the alert → restore the
//     margin it had before (the target formula would say *lower* the price
//     or *add* more of the ingredient, which is no use to anyone)
//   - margin didn't drop → nothing to suggest.

export type GoalKind = "target" | "previous_margin";

export type ItemInputs = {
  sellingPrice: number;
  costPerServing: number; // now, after the price change
  servingsPerBatch: number; // menu item's servings_per_batch ?? recipe yield
  previousMarginPct: number; // from menu_item_margin_impacts, before the change
  targetMarginPct: number; // organizations.target_margin_pct
  ingredientQtyPerBatch: number; // recipe quantity of the ingredient that moved, in its base unit
  ingredientUnitCost: number; // that ingredient's current cost per base unit
  baseUnit: string;
};

export type RaisePrice = { new_price: number; increase: number; increase_pct: number };

export type ReducePortion =
  | {
      feasible: true;
      reduce_by: number; // base units per batch
      reduce_by_display: string; // e.g. "2.82 oz"
      new_qty: number;
      reduce_pct: number;
    }
  | { feasible: false; reason: string };

export type ItemSuggestion = {
  current_margin_pct: number;
  goal: { kind: GoalKind; margin_pct: number } | null;
  raise_price: RaisePrice | null;
  reduce_portion: ReducePortion | null;
  // For reference whatever the goal: the price that hits the org target
  // exactly, and whether the item is already there.
  target_check: { target_margin_pct: number; price_at_target: number; meets_target: boolean };
};

const roundTo = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;
// Prices round *up* to the cent so the suggested price never lands a hair
// under the goal.
const ceilCents = (n: number) => Math.ceil(roundTo(n * 100, 6)) / 100;

export function marginPct(price: number, costPerServing: number) {
  return price > 0 ? roundTo(((price - costPerServing) / price) * 100, 2) : 0;
}

export function suggestForItem(x: ItemInputs): ItemSuggestion {
  const current = marginPct(x.sellingPrice, x.costPerServing);
  const target_check = {
    target_margin_pct: x.targetMarginPct,
    price_at_target: ceilCents(x.costPerServing / (1 - x.targetMarginPct / 100)),
    meets_target: current >= x.targetMarginPct,
  };

  let goal: ItemSuggestion["goal"] = null;
  if (current < x.targetMarginPct) goal = { kind: "target", margin_pct: x.targetMarginPct };
  else if (current < x.previousMarginPct) goal = { kind: "previous_margin", margin_pct: x.previousMarginPct };
  if (!goal) return { current_margin_pct: current, goal, raise_price: null, reduce_portion: null, target_check };

  const keep = 1 - goal.margin_pct / 100; // cost as a share of price at the goal

  // Raise price: new_price = cost_per_serving / (1 - goal%)   (§8)
  const newPrice = ceilCents(x.costPerServing / keep);
  const raise_price: RaisePrice = {
    new_price: newPrice,
    increase: roundTo(newPrice - x.sellingPrice, 2),
    increase_pct: roundTo(((newPrice - x.sellingPrice) / x.sellingPrice) * 100, 1),
  };

  // Reduce portion: hold the price, back-solve the moved ingredient's recipe
  // quantity so cost_per_serving comes down to price × (1 - goal%).
  const allowedCostPerServing = x.sellingPrice * keep;
  const excessPerBatch = (x.costPerServing - allowedCostPerServing) * x.servingsPerBatch;
  const reduceBy = excessPerBatch / x.ingredientUnitCost;
  let reduce_portion: ReducePortion;
  if (!(x.ingredientUnitCost > 0)) {
    reduce_portion = { feasible: false, reason: "ingredient has no cost" };
  } else if (reduceBy >= x.ingredientQtyPerBatch) {
    reduce_portion = {
      feasible: false,
      reason: `would need to cut more than the whole ${roundTo(x.ingredientQtyPerBatch, 4)} ${x.baseUnit} in the recipe`,
    };
  } else {
    reduce_portion = {
      feasible: true,
      reduce_by: roundTo(reduceBy, 4),
      reduce_by_display: displayQty(reduceBy, x.baseUnit),
      new_qty: roundTo(x.ingredientQtyPerBatch - reduceBy, 4),
      reduce_pct: roundTo((reduceBy / x.ingredientQtyPerBatch) * 100, 1),
    };
  }

  return { current_margin_pct: current, goal, raise_price, reduce_portion, target_check };
}

// Small amounts read better in the kitchen's everyday unit: 0.18 lb → 2.82 oz.
function displayQty(qty: number, baseUnit: string) {
  if (baseUnit === "lb" && qty < 1) return `${roundTo(qty * 16, 2)} oz`;
  if (baseUnit === "kg" && qty < 1) return `${roundTo(qty * 1000, 0)} g`;
  if (baseUnit === "gal" && qty < 1) return `${roundTo(qty * 128, 1)} fl oz`;
  return `${roundTo(qty, 3)} ${baseUnit}`;
}
