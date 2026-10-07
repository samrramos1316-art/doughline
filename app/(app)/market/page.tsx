import { createClient } from "@/lib/supabase/server";
import { getMarketTrends, DEFAULT_WINDOW_DAYS } from "@/lib/market/trends";
import { MarketWatchPanel } from "@/components/market/MarketWatchPanel";
import { PageHeader, Kpi, Delta, Panel, Empty } from "@/components/ui/dash";
import { getIndustry } from "@/lib/supabase/vocab";

const WINDOWS = [30, 90, 180];

export default async function MarketPage({ searchParams }: { searchParams: Promise<{ window?: string }> }) {
  const { window } = await searchParams;
  const windowDays = WINDOWS.includes(Number(window)) ? Number(window) : DEFAULT_WINDOW_DAYS;
  const supabase = await createClient();
  // No series for this industry is fetched yet (lib/industries): say so
  // rather than show food prices.
  const industry = await getIndustry();
  if (!industry.hasMarketData) {
    return (
      <>
        <PageHeader title="Market watch" subtitle="National and global wholesale prices — directional context, not a forecast." />
        <Panel title="Not available yet">
          <Empty>Market prices for {industry.name.toLowerCase()} supplies aren&apos;t tracked yet. Your real price changes are under Price alerts.</Empty>
        </Panel>
      </>
    );
  }
  const trends = await getMarketTrends(supabase, { windowDays });
  const yours = trends.filter((t) => t.exposed_ingredients.length > 0);
  const up = yours.filter((t) => t.pct_change >= 1);
  const biggest = [...yours].sort((a, b) => Math.abs(b.pct_change) - Math.abs(a.pct_change))[0];

  return (
    <>
      <PageHeader
        title="Market watch"
        subtitle="National and global wholesale prices — directional context for what your suppliers may charge next, not a forecast. Your real price changes are under Price alerts."
        tabs={WINDOWS.map((w) => ({ href: `/market?window=${w}`, label: `${w} days`, active: w === windowDays }))}
      />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Series tracked" value={trends.length} sub="USDA + FAO, updated daily" />
        <Kpi label="Linked to you" value={yours.length} sub={yours.map((t) => t.label).slice(0, 2).join(", ") || "none yet"} />
        <Kpi label="Rising for you" value={up.length} tone={up.length ? "warning" : "good"} sub={`over ${windowDays} days`} />
        <Kpi label="Biggest move" value={biggest ? <Delta value={biggest.pct_change} /> : "—"} sub={biggest?.label ?? "—"} />
      </div>
      <MarketWatchPanel trends={trends} windowDays={windowDays} />
    </>
  );
}
