import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";
import { parseCsv } from "@/lib/csv";
import { localDateFrom } from "@/lib/dates/localDate";
import { bulkUpsertIngredients, type IngredientRowInput } from "@/lib/ingredients/bulkUpsert";
import { retryUnappliedPrices } from "@/lib/costing/retryPrices";
import { getIndustry } from "@/lib/supabase/vocab";
import { newMaterialWastePct } from "@/lib/industries";

// One Voyage call for every new/renamed ingredient, retried on 429s.
export const maxDuration = 300;

const COLUMNS = ["id", "name", "category", "base_unit", "current_unit_cost", "commodity_code", "waste_pct", "per_bunch", "per_box"] as const;

// §9.2: bulk upsert of the ingredient list. Takes either a CSV file body
// (text/csv — a spreadsheet exported from GET /api/ingredients/export, or
// any sheet with at least name + base_unit columns) or JSON { rows } from
// the ingredient grid. Same validation and write path either way.
export async function POST(request: Request) {
  const supabase = await createClient();
  const orgId = await getCurrentOrgId(supabase);
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let rows: IngredientRowInput[];
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const body = await request.json().catch(() => null);
    if (!body || !Array.isArray(body.rows)) return NextResponse.json({ error: "Expected { rows: [...] }" }, { status: 400 });
    rows = body.rows;
  } else {
    const table = parseCsv(await request.text());
    if (table.length < 2) return NextResponse.json({ error: "The CSV has no data rows" }, { status: 400 });
    const header = table[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
    for (const required of ["name", "base_unit"]) {
      if (!header.includes(required)) {
        return NextResponse.json({ error: `The CSV needs a "${required}" column` }, { status: 400 });
      }
    }
    const col = Object.fromEntries(COLUMNS.map((c) => [c, header.indexOf(c)]));
    const get = (r: string[], c: (typeof COLUMNS)[number]) => (col[c] >= 0 ? (r[col[c]] ?? "") : undefined);
    rows = table.slice(1).map((r, i) => ({
      row: i + 2, // spreadsheet line number: the header is line 1
      id: get(r, "id"),
      name: get(r, "name") ?? "",
      category: get(r, "category"),
      base_unit: get(r, "base_unit") ?? "",
      current_unit_cost: get(r, "current_unit_cost"),
      commodity_code: get(r, "commodity_code"),
      waste_pct: get(r, "waste_pct"),
      per_bunch: get(r, "per_bunch"),
      per_box: get(r, "per_box"),
    }));
  }
  if (rows.length > 2000) return NextResponse.json({ error: "At most 2000 rows per import" }, { status: 400 });

  const industry = await getIndustry();
  const result = await bulkUpsertIngredients(supabase, orgId, rows, localDateFrom(request), (category) => newMaterialWastePct(industry, category));
  if ("errors" in result) {
    return NextResponse.json({ error: "Nothing was saved — fix these rows first", row_errors: result.errors }, { status: 400 });
  }
  // Rows whose base unit or bunch/box size changed may now convert their
  // stuck invoice prices.
  const unitChanged = result.outcomes.filter((o) => o.changes.some((c) => c.startsWith("base unit") || c.startsWith("per bunch") || c.startsWith("per box"))).map((o) => o.id);
  const prices = await retryUnappliedPrices(supabase, unitChanged);
  const count = (a: string) => result.outcomes.filter((o) => o.action === a).length;
  return NextResponse.json({
    inserted: count("inserted"),
    updated: count("updated"),
    unchanged: count("unchanged"),
    outcomes: result.outcomes,
    embedding_error: result.embeddingError,
    prices_applied: prices.filter((p) => p.applied).length,
  });
}
