import { NextResponse } from "next/server";
import { ingestMarketData } from "@/lib/market/ingest";

// A year of USDA daily reports plus the FAO CSV takes a few seconds; leave room.
export const maxDuration = 300;

// §7: the commodity-price ingestion job, run daily by Vercel Cron
// (vercel.json). Vercel sends `Authorization: Bearer $CRON_SECRET`; anything
// else is refused, since this route writes with the service role.
// ?days=N widens the window (default 400: enough for a 90-day trend plus a
// long gap in runs).
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const daysParam = Number(new URL(request.url).searchParams.get("days"));
  const days = Number.isFinite(daysParam) && daysParam > 0 ? Math.min(daysParam, 2000) : 400;

  const started = Date.now();
  try {
    const series = await ingestMarketData({ days });
    const failed = series.filter((s) => s.error);
    return NextResponse.json(
      { ok: failed.length === 0, days, seconds: (Date.now() - started) / 1000, series },
      { status: failed.length === series.length ? 502 : 200 },
    );
  } catch (err) {
    console.error("[cron] market ingest failed:", err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
