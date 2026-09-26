import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RecipeBuilder } from "@/components/recipes/RecipeBuilder";

export default async function RecipeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: recipe } = await supabase.from("recipes").select("*").eq("id", id).single();
  if (!recipe) notFound();

  const { data: recipeIngredients } = await supabase
    .from("recipe_ingredients")
    .select("ingredient_id, quantity, unit")
    .eq("recipe_id", id);

  const { data: allIngredients } = await supabase
    .from("ingredients")
    .select("id, name, base_unit")
    .order("name");

  const { data: cost } = await supabase.from("recipe_costs").select("*").eq("recipe_id", id).maybeSingle();

  const initialRows = (recipeIngredients ?? []).map((ri) => ({
    ingredient_id: ri.ingredient_id,
    quantity: String(ri.quantity),
    unit: ri.unit,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">{recipe.name}</h1>
        <p className="text-sm text-zinc-600">
          Batch yield: {recipe.batch_yield_qty} {recipe.batch_yield_unit}
        </p>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <p className="text-sm text-zinc-500">Cost per serving (live, from the recipe_costs view)</p>
        <p className="text-2xl font-semibold text-zinc-900">
          {cost?.cost_per_serving != null ? `$${Number(cost.cost_per_serving).toFixed(4)}` : "—"}
        </p>
      </div>

      <RecipeBuilder recipeId={id} ingredientOptions={allIngredients ?? []} initialRows={initialRows} />
    </div>
  );
}
