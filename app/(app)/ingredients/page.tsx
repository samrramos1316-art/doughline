import { createClient } from "@/lib/supabase/server";
import { IngredientForm } from "@/components/ingredients/IngredientForm";

export default async function IngredientsPage() {
  const supabase = await createClient();
  const { data: ingredients } = await supabase.from("ingredients").select("*").order("name");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-zinc-900">Ingredients</h1>
      <IngredientForm />
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-zinc-500">
            <th className="py-2">Name</th>
            <th>Category</th>
            <th>Base unit</th>
            <th>Unit cost</th>
          </tr>
        </thead>
        <tbody>
          {(ingredients ?? []).map((i) => (
            <tr key={i.id} className="border-b border-zinc-100">
              <td className="py-2">{i.name}</td>
              <td>{i.category ?? "—"}</td>
              <td>{i.base_unit}</td>
              <td>{i.current_unit_cost != null ? `$${Number(i.current_unit_cost).toFixed(4)}` : "—"}</td>
            </tr>
          ))}
          {(ingredients ?? []).length === 0 && (
            <tr>
              <td colSpan={4} className="py-4 text-zinc-400">
                No ingredients yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
