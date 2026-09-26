// Hardcoded mock data for the Market Watch panel (§7). Field names mirror
// commodity_price_series (§3.10), pre-aggregated into the % change over a
// window a real GET /api/market-trends would compute — no USDA/FAO
// ingestion job wired up yet.

export type MockCommodityTrend = {
  commodity_code: string;
  label: string;
  region: "US" | "global";
  current_value: number;
  unit: string;
  pct_change_90d: number;
  exposed_ingredients: string[];
};

export const mockCommodityTrends: MockCommodityTrend[] = [
  {
    commodity_code: "wheat", label: "Wheat (US wholesale)", region: "US",
    current_value: 6.85, unit: "usd_per_bushel", pct_change_90d: 14.2,
    exposed_ingredients: ["Flour"],
  },
  {
    commodity_code: "eggs_large_white", label: "Eggs, Large White (US wholesale)", region: "US",
    current_value: 3.12, unit: "usd_per_dozen", pct_change_90d: 22.8,
    exposed_ingredients: ["Eggs"],
  },
  {
    commodity_code: "fao_dairy_index", label: "Dairy (FAO index)", region: "global",
    current_value: 138.4, unit: "index_point", pct_change_90d: 6.1,
    exposed_ingredients: ["Butter"],
  },
  {
    commodity_code: "sugar", label: "Sugar (US wholesale)", region: "US",
    current_value: 0.41, unit: "usd_per_lb", pct_change_90d: -3.4,
    exposed_ingredients: ["Sugar"],
  },
];
