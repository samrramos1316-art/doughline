import { mockCommodityTrends } from "@/lib/mock/market";
import { TrendArrow } from "@/components/market/TrendArrow";

export default function MarketPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Market Watch</h1>
        <p className="text-sm text-zinc-500">
          Directional context from national/global commodity data — not a prediction about your
          next invoice (§7).
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {mockCommodityTrends.map((c) => (
          <div key={c.commodity_code} className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium text-zinc-900">{c.label}</p>
              <TrendArrow pct={c.pct_change_90d} />
            </div>
            <p className="mt-1 text-sm text-zinc-500">
              {c.current_value} {c.unit.replace(/_/g, " ")} · {c.region === "US" ? "US" : "Global"}
            </p>
            <p className="mt-2 text-sm text-zinc-600">
              {c.pct_change_90d > 0 ? "Up" : "Down"} {Math.abs(c.pct_change_90d).toFixed(1)}% over 90
              days — {c.exposed_ingredients.join(", ")} cost may follow.
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
