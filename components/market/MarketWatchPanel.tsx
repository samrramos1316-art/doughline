import Link from "next/link";
import type { MarketTrend } from "@/lib/market/trends";
import { TrendArrow } from "@/components/market/TrendArrow";
import { TrendSparkline } from "@/components/visual/TrendSparkline";

function formatValue(value: number, unit: string) {
  switch (unit) {
    case "usd_per_dozen":
      return `$${value.toFixed(2)}/dozen`;
    case "usd_per_lb":
      return `$${value.toFixed(4).replace(/0{1,2}$/, "")}/lb`;
    case "usd_per_bushel":
      return `$${value.toFixed(2)}/bu`;
    case "index_point":
      return `${value.toFixed(1)} (index)`;
    default:
      return `${value} ${unit.replace(/_/g, " ")}`;
  }
}

function formatDate(iso: string, monthly: boolean) {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", monthly ? { month: "short", year: "numeric", timeZone: "UTC" } : { month: "short", day: "numeric", timeZone: "UTC" });
}

// §7: Market Watch — directional context from national/global commodity
// data, kept visually apart from the red/amber invoice alerts (§6): muted
// slate, no severity colors, and a standing reminder that it isn't a
// forecast of anyone's next invoice.
export function MarketWatchPanel({
  trends,
  windowDays,
  compact = false,
}: {
  trends: MarketTrend[];
  windowDays: number;
  compact?: boolean;
}) {
  const shown = compact ? trends.filter((t) => t.exposed_ingredients.length > 0).slice(0, 3) : trends;

  return (
    <section aria-label="Market Watch" className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-wide text-slate-600 uppercase">Market Watch</h2>
        <p className="text-xs text-slate-500">
          Change over {windowDays} days · context, not a forecast
          {compact && (
            <>
              {" · "}
              <Link href="/market" className="underline">
                All series
              </Link>
            </>
          )}
        </p>
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-slate-500">
          {trends.length === 0
            ? "No market data yet — it's pulled from USDA and FAO once a day."
            : "None of your ingredients follow a tracked commodity yet."}
        </p>
      ) : (
        <ul className={`grid gap-3 ${compact ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
          {shown.map((t) => {
            const monthly = t.source === "fao_fpi";
            return (
              <li key={t.commodity_code} data-testid="market-trend" data-code={t.commodity_code} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-slate-900">{t.label}</p>
                  <span className="text-slate-600">
                    <TrendArrow pct={t.pct_change} />
                  </span>
                </div>
                <div className="mt-1 flex items-end justify-between gap-2">
                  <p className="text-xs text-slate-500">
                    {formatValue(t.baseline.value, t.unit)} ({formatDate(t.baseline.date, monthly)}) →{" "}
                    <span className="font-medium text-slate-700">{formatValue(t.current.value, t.unit)}</span> (
                    {formatDate(t.current.date, monthly)})
                  </p>
                  <TrendSparkline points={t.points} width={80} height={24} />
                </div>
                <p data-testid="market-summary" className="mt-2 text-sm text-slate-700">
                  {t.summary}
                </p>
                {!compact && (
                  <p className="mt-1 text-xs text-slate-400">
                    {t.source === "usda_ams" ? "USDA AMS MyMarketNews" : "FAO Food Price Index (2014–16 = 100)"} ·{" "}
                    {t.region === "US" ? "US" : "Global"}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
