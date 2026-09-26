import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";
import { updateRecipeSchema } from "@/lib/validators/recipe";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: recipe, error } = await supabase.from("recipes").select("*").eq("id", id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  const { data: ingredients, error: riError } = await supabase
    .from("recipe_ingredients")
    .select("id, quantity, unit, ingredient_id, ingredients(id, name, base_unit, current_unit_cost)")
    .eq("recipe_id", id);
  if (riError) return NextResponse.json({ error: riError.message }, { status: 400 });

  return NextResponse.json({ recipe, ingredients });
}

// A "recipe builder" saves the recipe and its full ingredient list together
// (§13 step 3) — the architecture doc's API table has no separate
// recipe_ingredients endpoint, so PATCH replaces the whole ingredients set
// when one is supplied, alongside any recipe-level field updates.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const orgId = await getCurrentOrgId(supabase);
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const parsed = updateRecipeSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const { ingredients, ...recipeFields } = parsed.data;

  if (Object.keys(recipeFields).length > 0) {
    const { error } = await supabase.from("recipes").update(recipeFields).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (ingredients) {
    const { error: deleteError } = await supabase.from("recipe_ingredients").delete().eq("recipe_id", id);
    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 400 });

    if (ingredients.length > 0) {
      const rows = ingredients.map((i) => ({ ...i, org_id: orgId, recipe_id: id }));
      const { error: insertError } = await supabase.from("recipe_ingredients").insert(rows);
      if (insertError) return NextResponse.json({ error: insertError.message }, { status: 400 });
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { error } = await supabase.from("recipes").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
