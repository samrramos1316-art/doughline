// The calendar date where the business is, for prices typed in by hand.
//
// A price's effective_date decides whether an invoice counts as news or as
// history (migration 019: an invoice dated before the newest price on file
// only goes into history). Postgres's current_date is the UTC date, which in
// the US is already "tomorrow" every evening — so a price list entered at
// 8pm in Austin was dated the next day, and that day's invoices were then
// filed as history: no cost update, no alert. The browser sends its own date
// in this header instead (see LOCAL_DATE_HEADER's callers).
export const LOCAL_DATE_HEADER = "x-local-date";

// Today's date in the browser's time zone, as YYYY-MM-DD.
export function browserLocalDate(now = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// The client's date if it's a real date within a day of the server's UTC
// date (every time zone is), else the UTC date.
export function localDateFrom(request: Request, now = new Date()) {
  const utc = now.toISOString().slice(0, 10);
  const sent = request.headers.get(LOCAL_DATE_HEADER);
  if (!sent || !/^\d{4}-\d{2}-\d{2}$/.test(sent)) return utc;
  const t = Date.parse(`${sent}T00:00:00Z`);
  if (Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== sent) return utc;
  return Math.abs(t - Date.parse(`${utc}T00:00:00Z`)) <= 86_400_000 ? sent : utc;
}

// The UTC date N days ago, as YYYY-MM-DD — window starts for "last 30 days".
export function isoDaysAgo(days: number, now = Date.now()) {
  return new Date(now - days * 86_400_000).toISOString().slice(0, 10);
}
