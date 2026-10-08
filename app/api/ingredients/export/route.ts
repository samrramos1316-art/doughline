import { createClient } from "@/lib/supabase/server";
import { toCsv } from "@/lib/csv";
import { getIndustry } from "@/lib/supabase/vocab";

const INGREDIENT_CSV_HEADER = ["id", "name", "category", "base_unit", "current_unit_cost", "commodity_code"];

// §9.2: the whole master ingredient list as a spreadsheet — edit it anywhere,
// push it back through POST /api/ingredients/import. `id` lets renamed rows
// round-trip to the same ingredient.
export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ingredients")
    .select("id, name, category, base_unit, current_unit_cost, commodity_code, waste_pct")
    .order("name");
  if (error) return new Response(error.message, { status: 400 });

  // The waste % column (migration 027) only once it's in use, so a food
  // business's export is the same file as before.
  const withWaste = (await getIndustry()).defaults.default_waste_pct > 0 || data.some((i) => Number(i.waste_pct) > 0);
  const csv = toCsv(
    withWaste ? [...INGREDIENT_CSV_HEADER, "waste_pct"] : INGREDIENT_CSV_HEADER,
    data.map((i) => {
      const cells = [i.id, i.name, i.category, i.base_unit, i.current_unit_cost, i.commodity_code];
      return withWaste ? [...cells, i.waste_pct] : cells;
    }),
  );
  const date = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="doughtally-ingredients-${date}.csv"`,
    },
  });
}
