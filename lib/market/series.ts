import { parseCsv } from "@/lib/csv";

// §7 / §3.10: the commodity series DoughLine tracks. Each is one clean,
// comparable daily or monthly number — chosen by looking at what the
// sources actually publish (USDA reports split by grade, protein, region…;
// a series must pin those down or the "trend" would mix apples and pears).

export type SeriesPoint = {
  source: "usda_ams" | "fao_fpi";
  commodity_code: string;
  commodity_label: string;
  region: "US" | "global";
  period_date: string; // YYYY-MM-DD
  value: number;
  unit: string;
};

type UsdaRow = Record<string, unknown>;

type UsdaSeries = {
  code: string;
  label: string;
  unit: string;
  slug: number;
  section?: string; // report section holding the prices (header rows otherwise)
  extraQuery?: string; // server-side filter, appended to the date range
  match: (r: UsdaRow) => boolean;
  value: (r: UsdaRow) => number | null;
};

export const USDA_SERIES: UsdaSeries[] = [
  {
    // Daily National Shell Egg Index (5-day rolling, volume-weighted), the
    // wholesale benchmark for conventional large eggs. USDA reports cents.
    code: "eggs_large_white",
    label: "Eggs, large white (US wholesale)",
    unit: "usd_per_dozen",
    slug: 2843,
    section: "Report Detail Weighted",
    match: (r) => r.egg_type === "Graded Loose" && r.environment === "Caged" && r.color === "White" && r.class === "Large",
    value: (r) => (r.wtd_avg_price == null ? null : Number(r.wtd_avg_price) / 100),
  },
  {
    // CME Group spot butter (Grade AA), the price US butter is sold off.
    // (The regional "Butter - Central U.S." reports are mostly basis vs CME,
    // not prices.)
    code: "butter",
    label: "Butter, Grade AA (CME spot)",
    unit: "usd_per_lb",
    slug: 1603,
    extraQuery: "commodity=Butter",
    match: (r) => r.commodity === "Butter" && r.grade === "Grade AA",
    value: (r) => (r.close_price == null ? null : Number(r.close_price)),
  },
  {
    // Kansas City hard red winter wheat — the class milled into all-purpose
    // and bread flour — US #1, 12.0% protein, rail to mills.
    code: "wheat",
    label: "Wheat, hard red winter (Kansas City)",
    unit: "usd_per_bushel",
    slug: 3223,
    section: "Report Detail",
    match: (r) =>
      r.class === "Hard Red Winter" &&
      r.grade === "US #1" &&
      r.protein === "12.0%" &&
      r.delivery_point === "Mills and Processors" &&
      r.trans_mode === "Rail",
    value: (r) => (r.avg_price == null ? null : Number(r.avg_price)),
  },
];

const MARS_BASE = "https://marsapi.ams.usda.gov/services/v1.2";

// MyMarketNews wants HTTP Basic with the API key as the username and an
// empty password — not a bearer token.
function usdaAuthHeader() {
  const key = process.env.USDA_API_KEY;
  if (!key) throw new Error("USDA_API_KEY is not set");
  return "Basic " + Buffer.from(`${key}:`).toString("base64");
}

const usdaDate = (d: Date) =>
  `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}/${d.getUTCFullYear()}`;

export async function fetchUsdaSeries(series: UsdaSeries, from: Date, to: Date): Promise<SeriesPoint[]> {
  const q = [`report_begin_date=${usdaDate(from)}:${usdaDate(to)}`, series.extraQuery].filter(Boolean).join(";");
  const path = `reports/${series.slug}${series.section ? `/${encodeURIComponent(series.section)}` : ""}`;
  const res = await fetch(`${MARS_BASE}/${path}?q=${encodeURIComponent(q)}`, {
    headers: { Authorization: usdaAuthHeader() },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`USDA ${series.code}: HTTP ${res.status}`);
  const body = await res.json();
  const rows: UsdaRow[] = body.results ?? [];

  // One value per report date; if a filter ever lets two rows through, keep
  // the first rather than silently averaging different products.
  const byDate = new Map<string, SeriesPoint>();
  for (const r of rows) {
    if (!series.match(r)) continue;
    const value = series.value(r);
    const date = String(r.report_date ?? "");
    const m = date.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (value == null || !Number.isFinite(value) || !m) continue;
    const iso = `${m[3]}-${m[1]}-${m[2]}`;
    if (byDate.has(iso)) continue;
    byDate.set(iso, {
      source: "usda_ams",
      commodity_code: series.code,
      commodity_label: series.label,
      region: "US",
      period_date: iso,
      value: Math.round(value * 10000) / 10000,
      unit: series.unit,
    });
  }
  return [...byDate.values()];
}

// FAO Food Price Index (2014-2016 = 100): monthly, global, five food groups.
// One public CSV, no key; the first data column is the overall index.
export const FAO_CSV_URL =
  "https://www.fao.org/media/docs/worldfoodsituationlibraries/default-document-library/food_price_indices_data.csv";

export const FAO_SERIES: Record<string, { code: string; label: string }> = {
  "Food Price Index": { code: "fao_food_price_index", label: "Food prices overall (FAO index)" },
  Meat: { code: "fao_meat_index", label: "Meat (FAO index)" },
  Dairy: { code: "fao_dairy_index", label: "Dairy (FAO index)" },
  Cereals: { code: "fao_cereals_index", label: "Cereals (FAO index)" },
  Oils: { code: "fao_oils_index", label: "Vegetable oils (FAO index)" },
  Sugar: { code: "fao_sugar_index", label: "Sugar (FAO index)" },
};

export async function fetchFaoSeries(since: Date): Promise<SeriesPoint[]> {
  const res = await fetch(FAO_CSV_URL, { headers: { "User-Agent": "DoughLine market ingest" }, cache: "no-store" });
  if (!res.ok) throw new Error(`FAO: HTTP ${res.status}`);
  const table = parseCsv(await res.text());
  const headerIdx = table.findIndex((r) => r[0]?.trim() === "Date");
  if (headerIdx < 0) throw new Error("FAO: couldn't find the header row — the CSV layout changed");
  const header = table[headerIdx].map((h) => h.trim());
  const sinceMonth = since.toISOString().slice(0, 7);

  const points: SeriesPoint[] = [];
  for (const row of table.slice(headerIdx + 1)) {
    const month = row[0]?.trim();
    if (!/^\d{4}-\d{2}$/.test(month ?? "") || month < sinceMonth) continue;
    header.forEach((col, i) => {
      const s = FAO_SERIES[col];
      const v = Number(row[i]);
      if (!s || !row[i]?.trim() || !Number.isFinite(v)) return;
      points.push({
        source: "fao_fpi",
        commodity_code: s.code,
        commodity_label: s.label,
        region: "global",
        period_date: `${month}-01`,
        value: v,
        unit: "index_point",
      });
    });
  }
  return points;
}
