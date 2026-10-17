import { test } from "node:test";
import assert from "node:assert/strict";
import { holidayLift, holidaysOf, monthlyAverages, yearOverYear } from "./seasons.ts";

const p = (unit_cost: number, effective_date: string, unit = "stem") => ({ unit_cost, unit, effective_date });

test("holidays: Mother's Day is the second Sunday of May", () => {
  assert.deepEqual(holidaysOf(2026).map((h) => h.date), ["2026-02-14", "2026-05-10", "2026-12-25"]);
  assert.equal(holidaysOf(2025).find((h) => h.key === "mothers_day")!.date, "2025-05-11");
  assert.equal(holidaysOf(2027).find((h) => h.key === "mothers_day")!.date, "2027-05-09"); // May 1 2027 is a Saturday
});

test("monthly averages, in the base unit, for one year", () => {
  const history = [p(1, "2026-01-05"), p(2, "2026-01-20"), p(3.5, "2026-02-10"), p(9, "2025-02-10"), p(30, "2026-03-01", "bunch")];
  const months = monthlyAverages(history, "stems", 2026);
  assert.deepEqual(months.slice(0, 3), [1.5, 3.5, null]);
  assert.equal(months.filter((m) => m != null).length, 2);
  assert.equal(monthlyAverages(history, "stem", 2025)[1], 9);
});

test("holiday lift: the three weeks up to the holiday against the rest of the year", () => {
  const roses = [p(1, "2025-06-01"), p(1.2, "2025-10-01"), p(1.1, "2026-01-10"), p(2.2, "2026-02-01"), p(2.4, "2026-02-12"), p(3, "2026-03-01")];
  const lift = holidayLift(roses, "stem", "2026-02-14")!;
  assert.deepEqual(lift, { before: 2.3, rest: 1.1, liftPct: 109.1 }); // March is after the holiday: left out
  assert.equal(holidayLift(roses, "stem", "2026-05-10"), null); // nothing in the three weeks before
  assert.equal(yearOverYear(2.3, 2), 15);
  assert.equal(yearOverYear(null, 2), null);
});
