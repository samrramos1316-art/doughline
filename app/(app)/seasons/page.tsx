import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getIndustry } from "@/lib/supabase/vocab";
import { lower } from "@/lib/vocab";
import { HOLIDAY_WINDOW_DAYS, holidayLift, holidaysOf, monthlyAverages, yearOverYear, type DatedPrice, type Holiday } from "@/lib/costing/seasons";
import { PageHeader, Panel, Kpi, Empty, Delta, unitMoney, th, thNum, td, tdNum, row } from "@/components/ui/dash";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY = 86_400_000;
const fmtDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

// Seasonal prices (florists, lib/industries features.seasons): what each
// stem and supply cost month by month this year against last year, and how
// much more it cost in the three weeks before each flower holiday — from
// the owner's own invoices (lib/costing/seasons.ts).
export default async function SeasonsPage() {
  const industry = await getIndustry();
  if (!industry.features.seasons) notFound();
  const v = industry.vocab;
  const supabase = await createClient();
  // DOUGHTALLY_SEASONS_TODAY (YYYY-MM-DD) pins the date the page works from,
  // so its end-to-end test sees the same holidays any time of year.
  const pinned = process.env.DOUGHTALLY_SEASONS_TODAY;
  const today = pinned && /^\d{4}-\d{2}-\d{2}$/.test(pinned) ? pinned : new Date().toISOString().slice(0, 10);
  const year = Number(today.slice(0, 4));
  // Back far enough for last year's holidays and the year before each.
  const since = `${year - 2}-01-01`;
  const [{ data: materials }, { data: history }] = await Promise.all([
    supabase.from("ingredients").select("id, name, base_unit").order("name"),
    supabase.from("ingredient_price_history").select("ingredient_id, unit_cost, unit, effective_date").gte("effective_date", since),
  ]);
  const pricesOf = new Map<string, DatedPrice[]>();
  for (const h of history ?? []) pricesOf.set(h.ingredient_id, [...(pricesOf.get(h.ingredient_id) ?? []), h]);
  const tracked = (materials ?? []).filter((m) => pricesOf.has(m.id));

  // Each holiday's latest past date, and the one a year before it.
  const past = [...holidaysOf(year - 1), ...holidaysOf(year)].filter((h) => h.date <= today);
  const latest = (["valentines", "mothers_day", "christmas"] as const)
    .map((key) => past.filter((h) => h.key === key).at(-1))
    .filter((h): h is Holiday => !!h)
    .sort((a, b) => a.date.localeCompare(b.date));
  const yearBefore = (h: Holiday) => holidaysOf(Number(h.date.slice(0, 4)) - 1).find((x) => x.key === h.key)!;
  const next = [...holidaysOf(year), ...holidaysOf(year + 1)].find((h) => h.date > today)!;
  const daysToNext = Math.round((Date.parse(next.date) - Date.parse(today)) / DAY);

  const rows = tracked.map((m) => {
    const ps = pricesOf.get(m.id)!;
    return {
      m,
      lifts: latest.map((h) => ({ h, now: holidayLift(ps, m.base_unit, h.date), before: holidayLift(ps, m.base_unit, yearBefore(h).date) })),
      thisYear: monthlyAverages(ps, m.base_unit, year),
      lastYear: monthlyAverages(ps, m.base_unit, year - 1),
    };
  });
  // What last year's run-up to the next holiday did to prices.
  const nextLast = holidaysOf(Number(next.date.slice(0, 4)) - 1).find((h) => h.key === next.key)!;
  const upcoming = tracked
    .map((m) => ({ name: m.name, lift: holidayLift(pricesOf.get(m.id)!, m.base_unit, nextLast.date) }))
    .filter((x): x is { name: string; lift: NonNullable<typeof x.lift> } => x.lift != null)
    .sort((a, b) => b.lift.liftPct - a.lift.liftPct);

  return (
    <>
      <PageHeader
        title="Seasons"
        subtitle={`What your ${lower(v.ingredients)} cost through the year, from your own invoices: this year against last, and in the ${HOLIDAY_WINDOW_DAYS / 7} weeks before each flower holiday.`}
      />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Kpi label="Next holiday" value={next.name} sub={`${fmtDate(next.date)} · in ${daysToNext} day${daysToNext === 1 ? "" : "s"}`} />
        <Kpi
          label={`Last ${next.name}`}
          value={upcoming[0] ? <Delta value={upcoming[0].lift.liftPct} /> : "—"}
          sub={upcoming[0] ? `${upcoming[0].name}, ${HOLIDAY_WINDOW_DAYS / 7} weeks before vs the rest of the year` : "no prices from then yet"}
        />
        <Kpi label="Tracked" value={tracked.length} sub={`${lower(v.ingredients)} with prices since ${year - 2}`} />
      </div>

      {tracked.length === 0 ? (
        <Panel title="No price history yet">
          <Empty>Scan or type in invoices and each {lower(v.ingredient)}&apos;s prices build up here, month by month.</Empty>
        </Panel>
      ) : (
        <div className="flex flex-col gap-4">
          {upcoming.length > 0 && (
            <Panel title={`Before ${next.name} last year`} flush>
              <p className="px-3 pt-2 text-xs text-stone-500">
                Prices in the {HOLIDAY_WINDOW_DAYS / 7} weeks up to {fmtDate(nextLast.date)} against the year before that — a guide to what to expect by {fmtDate(next.date)}.
              </p>
              <ul className="grid gap-x-6 px-3 py-2 sm:grid-cols-2" data-testid="seasons-upcoming">
                {upcoming.slice(0, 6).map((u) => (
                  <li key={u.name} className="flex items-baseline justify-between gap-3 border-b border-stone-100 py-1.5 text-[13px]">
                    <span className="min-w-0 truncate text-stone-900">{u.name}</span>
                    <span className="tabular-nums whitespace-nowrap text-stone-600">
                      {unitMoney(u.lift.rest)} → {unitMoney(u.lift.before)} <Delta value={u.lift.liftPct} />
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <Panel title="Before the holidays" flush>
            <div className="overflow-x-auto">
              <table className="w-full" data-testid="seasons-holidays">
                <thead>
                  <tr>
                    <th className={th}>{v.ingredient}</th>
                    {latest.map((h) => (
                      <th key={h.key} className={thNum}>{h.name} {h.date.slice(0, 4)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ m, lifts }) => (
                    <tr key={m.id} className={row}>
                      <td className={td}>{m.name}</td>
                      {lifts.map(({ h, now, before }) => (
                        <td key={h.key} className={tdNum}>
                          {now ? <Delta value={now.liftPct} /> : <span className="text-stone-400">—</span>}
                          {before && <span className="block text-[11px] text-stone-500">year before: {before.liftPct > 0 ? "+" : ""}{before.liftPct.toFixed(1)}%</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="border-t border-stone-100 px-3 py-2 text-[11px] text-stone-400">
              Average price in the {HOLIDAY_WINDOW_DAYS / 7} weeks up to the holiday against the rest of the year before it. — means no prices on one side.
            </p>
          </Panel>

          <Panel title={`Month by month · ${year} against ${year - 1}`} flush>
            <div className="overflow-x-auto">
              <table className="w-full" data-testid="seasons-months">
                <thead>
                  <tr>
                    <th className={th}>{v.ingredient}</th>
                    {MONTHS.map((mo) => (
                      <th key={mo} className={thNum}>{mo}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ m, thisYear, lastYear }) => (
                    <tr key={m.id} className={row} data-name={m.name}>
                      <td className={td}>
                        {m.name}
                        <span className="block text-[11px] text-stone-500">per {m.base_unit}</span>
                      </td>
                      {thisYear.map((cur, i) => (
                        <td key={i} className={`${tdNum} align-top`}>
                          {cur == null ? <span className="text-stone-300">—</span> : unitMoney(cur)}
                          {lastYear[i] != null && (
                            <span className="block text-[11px] text-stone-500">
                              {unitMoney(lastYear[i])}
                              {cur != null && <> · <Delta value={yearOverYear(cur, lastYear[i])} /></>}
                            </span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="border-t border-stone-100 px-3 py-2 text-[11px] text-stone-400">Top: average paid in {year}. Below: {year - 1}, and the change.</p>
          </Panel>
        </div>
      )}
    </>
  );
}
