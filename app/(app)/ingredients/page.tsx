import { createClient } from "@/lib/supabase/server";
import { IngredientsGrid } from "@/components/ingredients/IngredientsGrid";

export default async function IngredientsPage() {
  const supabase = await createClient();
  const { data: ingredients } = await supabase
    .from("ingredients")
    .select("id, name, category, base_unit, current_unit_cost")
    .order("name");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Ingredients</h1>
        <p className="text-sm text-zinc-500">
          Edit in place, or paste rows from a spreadsheet. Costs are per base unit.
        </p>
      </div>
      <IngredientsGrid ingredients={ingredients ?? []} />
    </div>
  );
}
