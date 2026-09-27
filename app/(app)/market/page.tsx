import { createClient } from "@/lib/supabase/server";
import { getMarketTrends, DEFAULT_WINDOW_DAYS } from "@/lib/market/trends";
import { MarketWatchPanel } from "@/components/market/MarketWatchPanel";

const WINDOWS = [30, 90, 180];

export default async function MarketPage({ searchParams }: { searchParams: Promise<{ window?: string }> }) {
  const { window } = await searchParams;
  const windowDays = WINDOWS.includes(Number(window)) ? Number(window) : DEFAULT_WINDOW_DAYS;
  const supabase = await createClient();
  const trends = await getMarketTrends(supabase, { windowDays });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Market Watch</h1>
          <p className="max-w-2xl text-sm text-zinc-500">
            Where national and global commodity prices are heading. It&apos;s directional context — wholesale
            markets move before (and not always like) what your distributor charges — not a prediction about your
            next invoice. Your real price changes are under Alerts.
          </p>
        </div>
        <nav aria-label="Window" className="flex gap-1 text-sm">
          {WINDOWS.map((w) => (
            <a
              key={w}
              href={`/market?window=${w}`}
              aria-current={w === windowDays ? "page" : undefined}
              className={`rounded-full px-3 py-1 ${w === windowDays ? "bg-slate-700 text-white" : "border border-slate-300 text-slate-600"}`}
            >
              {w} days
            </a>
          ))}
        </nav>
      </div>
      <MarketWatchPanel trends={trends} windowDays={windowDays} />
    </div>
  );
}
