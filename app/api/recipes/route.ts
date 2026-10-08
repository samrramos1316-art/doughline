import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";
import { createRecipeSchema } from "@/lib/validators/recipe";
import { getIndustry } from "@/lib/supabase/vocab";

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("recipes").select("*").order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ recipes: data });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const orgId = await getCurrentOrgId(supabase);
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const parsed = createRecipeSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const { ingredients, ...recipeFields } = parsed.data;
  // The industry's usual overhead (lib/industries) unless one was given; 0 for food.
  const defaultOverhead = (await getIndustry()).defaults.default_overhead_pct;
  if (recipeFields.overhead_pct === undefined && defaultOverhead > 0) recipeFields.overhead_pct = defaultOverhead;

  const { data: recipe, error: recipeError } = await supabase
    .from("recipes")
    .insert({ ...recipeFields, org_id: orgId })
    .select()
    .single();
  if (recipeError) return NextResponse.json({ error: recipeError.message }, { status: 400 });

  if (ingredients.length > 0) {
    // waste_pct on every row, null = the material's waste % (migration 027).
    const rows = ingredients.map((i) => ({ ...i, waste_pct: i.waste_pct ?? null, org_id: orgId, recipe_id: recipe.id }));
    const { error: riError } = await supabase.from("recipe_ingredients").insert(rows);
    if (riError) return NextResponse.json({ error: riError.message }, { status: 400 });
  }

  return NextResponse.json({ recipe }, { status: 201 });
}
