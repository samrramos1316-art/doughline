import { createClient } from "@/lib/supabase/server";
import { toCsv } from "@/lib/csv";
import { getIndustry } from "@/lib/supabase/vocab";
import { cleanPackSizes } from "@/lib/costing/units";

const INGREDIENT_CSV_HEADER = ["id", "name", "category", "base_unit", "current_unit_cost", "commodity_code"];

// §9.2: the whole master ingredient list as a spreadsheet — edit it anywhere,
// push it back through POST /api/ingredients/import. `id` lets renamed rows
// round-trip to the same ingredient.
export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ingredients")
    .select("id, name, category, base_unit, current_unit_cost, commodity_code, waste_pct, pack_sizes")
    .order("name");
  if (error) return new Response(error.message, { status: 400 });

  // The waste % column (migration 027) only once it's in use, so a food
  // business's export is the same file as before.
  const industry = await getIndustry();
  const withWaste = industry.defaults.default_waste_pct > 0 || data.some((i) => Number(i.waste_pct) > 0);
  // Bunch/box sizes (migration 028) likewise only for an industry that uses them.
  const withPacks = industry.features.packSizes || data.some((i) => Object.keys(cleanPackSizes(i.pack_sizes)).length > 0);
  const header = [...INGREDIENT_CSV_HEADER, ...(withWaste ? ["waste_pct"] : []), ...(withPacks ? ["per_bunch", "per_box"] : [])];
  const csv = toCsv(
    header,
    data.map((i) => {
      const packs = cleanPackSizes(i.pack_sizes);
      return [
        i.id, i.name, i.category, i.base_unit, i.current_unit_cost, i.commodity_code,
        ...(withWaste ? [i.waste_pct] : []),
        ...(withPacks ? [packs.bunch ?? null, packs.box ?? null] : []),
      ];
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
