import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { commodityFor } from "./categoryDefaults";

export const DEFAULT_WINDOW_DAYS = 90;

// How the panel names each series in its one-line summary — always
// "… prices", so every sentence reads "… prices are up".
const SHORT_NAME: Record<string, string> = {
  eggs_large_white: "Wholesale egg prices",
  butter: "Butter prices",
  wheat: "Wheat prices",
  fao_food_price_index: "Global food prices",
  fao_dairy_index: "Global dairy prices",
  fao_cereals_index: "Global cereal prices",
  fao_sugar_index: "Global sugar prices",
  fao_oils_index: "Global vegetable oil prices",
  fao_meat_index: "Global meat prices",
};

export type MarketTrend = {
  commodity_code: string;
  label: string;
  source: string;
  region: string;
  unit: string;
  current: { date: string; value: number };
  baseline: { date: string; value: number };
  pct_change: number; // rounded to 0.1
  points: { date: string; value: number }[]; // baseline → current, for the sparkline
  exposed_ingredients: string[];
  summary: string;
};

const DAY = 86_400_000;
const addDays = (iso: string, days: number) => new Date(Date.parse(iso) + days * DAY).toISOString().slice(0, 10);

// §7: "computed on read as a simple % change over a configurable window" —
// nothing is stored. For each series: the latest point vs. the latest point
// on or before (latest − window). Monthly FAO data thus compares whole
// months (Aug vs. May for 90 days), and the panel shows both dates so the
// span is never implied.
export async function getMarketTrends(
  supabase: SupabaseClient<Database>,
  { windowDays = DEFAULT_WINDOW_DAYS }: { windowDays?: number } = {},
): Promise<MarketTrend[]> {
  // Enough history for the window even when a monthly series lags ~2 months.
  const since = new Date(Date.now() - (windowDays + 120) * DAY).toISOString().slice(0, 10);
  const [{ data: rows, error }, { data: ingredients }] = await Promise.all([
    supabase
      .from("commodity_price_series")
      .select("source, commodity_code, commodity_label, region, period_date, value, unit")
      .gte("period_date", since)
      .order("period_date", { ascending: true }),
    supabase.from("ingredients").select("name, category, commodity_code").order("name"),
  ]);
  if (error) throw new Error("loading commodity prices failed: " + error.message);

  const exposure = new Map<string, string[]>();
  for (const i of ingredients ?? []) {
    const code = commodityFor(i);
    if (code) exposure.set(code, [...(exposure.get(code) ?? []), i.name]);
  }

  const byCode = new Map<string, NonNullable<typeof rows>>();
  for (const r of rows ?? []) byCode.set(r.commodity_code, [...(byCode.get(r.commodity_code) ?? []), r]);

  const trends: MarketTrend[] = [];
  for (const [code, series] of byCode) {
    const current = series[series.length - 1];
    const cutoff = addDays(current.period_date, -windowDays);
    const baseline = [...series].reverse().find((p) => p.period_date <= cutoff);
    if (!baseline || Number(baseline.value) === 0) continue; // not enough history yet

    const pct = Math.round(((Number(current.value) - Number(baseline.value)) / Number(baseline.value)) * 1000) / 10;
    const exposed = exposure.get(code) ?? [];
    trends.push({
      commodity_code: code,
      label: current.commodity_label,
      source: current.source,
      region: current.region,
      unit: current.unit,
      current: { date: current.period_date, value: Number(current.value) },
      baseline: { date: baseline.period_date, value: Number(baseline.value) },
      pct_change: pct,
      points: series.filter((p) => p.period_date >= baseline.period_date).map((p) => ({ date: p.period_date, value: Number(p.value) })),
      exposed_ingredients: exposed,
      summary: summarize(SHORT_NAME[code] ?? `${current.commodity_label} prices`, pct, windowDays, exposed),
    });
  }

  // What touches this kitchen first, biggest moves first; ambient context after.
  return trends.sort(
    (a, b) =>
      Number(b.exposed_ingredients.length > 0) - Number(a.exposed_ingredients.length > 0) ||
      Math.abs(b.pct_change) - Math.abs(a.pct_change),
  );
}

// "Wheat prices are up 13.2% over 90 days — your All-Purpose Flour, Bread
// Flour costs may follow." Context, not a forecast (§7): no dollar amounts.
export function summarize(name: string, pct: number, windowDays: number, exposed: string[]) {
  const span = `over ${windowDays} days`;
  const move = Math.abs(pct) < 1 ? `are roughly flat ${span}` : `are ${pct > 0 ? "up" : "down"} ${Math.abs(pct).toFixed(1)}% ${span}`;
  if (!exposed.length || Math.abs(pct) < 1) return `${name} ${move}.`;
  const list = exposed.length > 3 ? `${exposed.slice(0, 3).join(", ")} and ${exposed.length - 3} more` : exposed.join(", ");
  return `${name} ${move} — your ${list} costs may ${pct > 0 ? "follow" : "ease"}.`;
}
