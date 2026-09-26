import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { NewRecipeForm } from "@/components/recipes/NewRecipeForm";

export default async function RecipesPage() {
  const supabase = await createClient();
  const { data: recipes } = await supabase.from("recipes").select("*").order("name");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-zinc-900">Recipes</h1>
      <NewRecipeForm />
      <ul className="flex flex-col gap-2">
        {(recipes ?? []).map((r) => (
          <li key={r.id} className="rounded-lg border border-zinc-200 bg-white px-4 py-3">
            <Link href={`/recipes/${r.id}`} className="text-sm font-medium text-zinc-900 underline">
              {r.name}
            </Link>
            <span className="ml-2 text-sm text-zinc-500">
              {r.batch_yield_qty} {r.batch_yield_unit}
            </span>
          </li>
        ))}
        {(recipes ?? []).length === 0 && <p className="text-sm text-zinc-400">No recipes yet.</p>}
      </ul>
    </div>
  );
}
