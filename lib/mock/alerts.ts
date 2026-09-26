// Hardcoded mock data for the alerts/suggestions UI — field names mirror
// price_alerts/menu_item_margin_impacts (§3.7/§3.11). suggestions and
// ai_narrative stand in for §8's deterministic-suggestion engine and Claude
// narrative call, neither of which is wired up yet.

export type MockMarginImpact = {
  id: string;
  menu_item_name: string;
  previous_margin_pct: number;
  new_margin_pct: number;
  margin_pct_delta: number;
};

export type MockSuggestion =
  | { type: "raise_price"; menu_item_name: string; current_price: number; new_price: number }
  | { type: "reduce_portion"; menu_item_name: string; ingredient_name: string; reduce_by: number; unit: string };

export type MockAlert = {
  id: string;
  ingredient_name: string;
  previous_unit_cost: number;
  new_unit_cost: number;
  pct_change: number;
  acknowledged: boolean;
  created_at: string;
  margin_impacts: MockMarginImpact[];
  suggestions: MockSuggestion[];
  ai_narrative: string;
};

export const mockAlerts: MockAlert[] = [
  {
    id: "alert-1",
    ingredient_name: "Chicken Breast",
    previous_unit_cost: 2.1,
    new_unit_cost: 2.35,
    pct_change: 11.9,
    acknowledged: false,
    created_at: "2026-09-24T08:00:00Z",
    margin_impacts: [
      { id: "mi-1", menu_item_name: "Chicken Sandwich", previous_margin_pct: 34, new_margin_pct: 29, margin_pct_delta: -5 },
      { id: "mi-2", menu_item_name: "Chicken Caesar Wrap", previous_margin_pct: 41, new_margin_pct: 37, margin_pct_delta: -4 },
      { id: "mi-3", menu_item_name: "Family Platter", previous_margin_pct: 22, new_margin_pct: 17, margin_pct_delta: -5 },
    ],
    suggestions: [
      { type: "raise_price", menu_item_name: "Chicken Sandwich", current_price: 9.0, new_price: 9.75 },
      { type: "reduce_portion", menu_item_name: "Chicken Sandwich", ingredient_name: "Chicken Breast", reduce_by: 0.6, unit: "oz" },
    ],
    ai_narrative:
      "Chicken Breast's 12% jump is squeezing all three menu items that use it, but the Chicken Sandwich took the biggest hit. Raising its price by $0.75 gets you back to your 65% target with a single, hard-to-notice increase for regulars — a 0.6oz portion cut would save the same margin, but on a sandwich that's already a smaller cut, and it's the kind of change customers do notice. Family Platter is now sitting at just 17% margin, so that one is worth a closer look too — it's the most exposed to another price move from this vendor.",
  },
  {
    id: "alert-2",
    ingredient_name: "Eggs",
    previous_unit_cost: 3.6,
    new_unit_cost: 4.42,
    pct_change: 22.8,
    acknowledged: false,
    created_at: "2026-09-22T09:30:00Z",
    margin_impacts: [
      { id: "mi-4", menu_item_name: "Buttercream Cupcake", previous_margin_pct: 64, new_margin_pct: 55, margin_pct_delta: -9 },
    ],
    suggestions: [
      { type: "raise_price", menu_item_name: "Buttercream Cupcake", current_price: 1.5, new_price: 1.85 },
    ],
    ai_narrative:
      "Egg prices are up sharply — this is the kind of move that's worth passing straight through rather than absorbing. A $0.35 price increase on the Buttercream Cupcake restores your target margin and is small enough that it's unlikely to affect volume.",
  },
  {
    id: "alert-3",
    ingredient_name: "Butter",
    previous_unit_cost: 7.2,
    new_unit_cost: 7.85,
    pct_change: 9.0,
    acknowledged: true,
    created_at: "2026-09-10T07:15:00Z",
    margin_impacts: [
      { id: "mi-5", menu_item_name: "Chocolate Chip Cookie", previous_margin_pct: 85, new_margin_pct: 83, margin_pct_delta: -2 },
    ],
    suggestions: [],
    ai_narrative:
      "This one barely moved the needle — Chocolate Chip Cookie's margin is still comfortably above target, so no action is needed here.",
  },
];

export function getMockAlert(id: string) {
  return mockAlerts.find((a) => a.id === id);
}
