// Seasonal prices (docs: florist "seasonal price view: cost by date, with
// comparison to the prior year when data exists (Valentine's Day, Mother's
// Day, holidays)"), from the owner's own price history — no market data.
// Pure: no I/O, so it runs under `node --test` as is.
import { sameUnit } from "./units.ts";

export type DatedPrice = { unit_cost: number | string; unit: string; effective_date: string };

export type Holiday = { key: "valentines" | "mothers_day" | "christmas"; name: string; date: string };

const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

// US flower holidays: Valentine's Day, Mother's Day (the second Sunday of
// May) and Christmas.
export function holidaysOf(year: number): Holiday[] {
  const may1 = new Date(Date.UTC(year, 4, 1)).getUTCDay(); // 0 = Sunday
  const firstSunday = 1 + ((7 - may1) % 7);
  return [
    { key: "valentines", name: "Valentine's Day", date: iso(year, 2, 14) },
    { key: "mothers_day", name: "Mother's Day", date: iso(year, 5, firstSunday + 7) },
    { key: "christmas", name: "Christmas", date: iso(year, 12, 25) },
  ];
}

const usable = (points: DatedPrice[], baseUnit: string) =>
  points.filter((p) => sameUnit(p.unit, baseUnit) && Number.isFinite(Number(p.unit_cost))).map((p) => ({ date: p.effective_date, cost: Number(p.unit_cost) }));
const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const round4 = (n: number) => Math.round(n * 10000) / 10000;

// The average price paid in each month of `year` (index 0 = January); null
// for a month with no price.
export function monthlyAverages(points: DatedPrice[], baseUnit: string, year: number): (number | null)[] {
  const byMonth: number[][] = Array.from({ length: 12 }, () => []);
  for (const p of usable(points, baseUnit)) {
    if (Number(p.date.slice(0, 4)) === year) byMonth[Number(p.date.slice(5, 7)) - 1].push(p.cost);
  }
  return byMonth.map((xs) => {
    const m = mean(xs);
    return m == null ? null : round4(m);
  });
}

export const HOLIDAY_WINDOW_DAYS = 21;
const DAY = 86_400_000;
const shift = (date: string, days: number) => new Date(Date.parse(date) + days * DAY).toISOString().slice(0, 10);

// How much more the material cost in the three weeks up to a holiday than
// the rest of the year around it (the 365 days up to the holiday, minus
// those weeks): +38 = 38% more. null without prices on both sides.
export function holidayLift(points: DatedPrice[], baseUnit: string, holidayDate: string, windowDays = HOLIDAY_WINDOW_DAYS) {
  const windowStart = shift(holidayDate, -windowDays);
  const yearStart = shift(holidayDate, -365);
  const ps = usable(points, baseUnit);
  const before = mean(ps.filter((p) => p.date > windowStart && p.date <= holidayDate).map((p) => p.cost));
  const rest = mean(ps.filter((p) => p.date > yearStart && p.date <= windowStart).map((p) => p.cost));
  if (before == null || rest == null || rest === 0) return null;
  return { before: round4(before), rest: round4(rest), liftPct: Math.round(((before - rest) / rest) * 1000) / 10 };
}

// Change from last year's price to this year's for the same month, %; null
// when either is missing.
export function yearOverYear(thisYear: number | null, lastYear: number | null): number | null {
  if (thisYear == null || lastYear == null || lastYear === 0) return null;
  return Math.round(((thisYear - lastYear) / lastYear) * 1000) / 10;
}
