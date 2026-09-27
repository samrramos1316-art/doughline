import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { USDA_SERIES, fetchUsdaSeries, fetchFaoSeries, type SeriesPoint } from "./series";

export type IngestSummary = {
  commodity_code: string;
  source: string;
  points: number;
  first: string | null;
  latest: { period_date: string; value: number } | null;
  error?: string;
};

// §7: pull every tracked series over the last `days` days and upsert into
// commodity_price_series (unique on source + commodity_code + period_date,
// so re-running is harmless and a daily run backfills any day it missed).
// Each source fails on its own: USDA being down doesn't stop FAO, and vice
// versa. Writes use the service role — this table has no user insert policy.
export async function ingestMarketData({ days = 400 }: { days?: number } = {}): Promise<IngestSummary[]> {
  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);
  const supabase = createAdminClient();
  const out: IngestSummary[] = [];

  const jobs: { code: string; source: string; run: () => Promise<SeriesPoint[]> }[] = [
    ...USDA_SERIES.map((s) => ({ code: s.code, source: "usda_ams", run: () => fetchUsdaSeries(s, from, to) })),
    { code: "fao_*", source: "fao_fpi", run: () => fetchFaoSeries(from) },
  ];

  for (const job of jobs) {
    let points: SeriesPoint[];
    try {
      points = await job.run();
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.error(`[market] ${job.code} fetch failed:`, error);
      out.push({ commodity_code: job.code, source: job.source, points: 0, first: null, latest: null, error });
      continue;
    }

    for (let i = 0; i < points.length; i += 500) {
      const { error } = await supabase
        .from("commodity_price_series")
        .upsert(points.slice(i, i + 500), { onConflict: "source,commodity_code,period_date" });
      if (error) throw new Error(`upserting ${job.code}: ${error.message}`);
    }

    const byCode = new Map<string, SeriesPoint[]>();
    for (const p of points) byCode.set(p.commodity_code, [...(byCode.get(p.commodity_code) ?? []), p]);
    for (const [code, ps] of byCode) {
      ps.sort((a, b) => a.period_date.localeCompare(b.period_date));
      const last = ps[ps.length - 1];
      out.push({
        commodity_code: code,
        source: job.source,
        points: ps.length,
        first: ps[0].period_date,
        latest: { period_date: last.period_date, value: last.value },
      });
    }
    if (points.length === 0) out.push({ commodity_code: job.code, source: job.source, points: 0, first: null, latest: null, error: "no rows matched" });
  }
  return out;
}
