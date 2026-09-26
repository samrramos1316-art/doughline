import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";
import { createIngredientSchema } from "@/lib/validators/ingredient";

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("ingredients").select("*").order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ingredients: data });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const orgId = await getCurrentOrgId(supabase);
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const parsed = createIngredientSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const { current_unit_cost, ...rest } = parsed.data;

  const { data: ingredient, error } = await supabase
    .from("ingredients")
    .insert({
      ...rest,
      org_id: orgId,
      current_unit_cost: current_unit_cost ?? null,
      current_unit_cost_updated_at: current_unit_cost != null ? new Date().toISOString() : null,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Cost is never just a stored number — every value is backed by a
  // price_history row, even one entered by hand (§3 design principles).
  if (current_unit_cost != null) {
    await supabase.from("ingredient_price_history").insert({
      org_id: orgId,
      ingredient_id: ingredient.id,
      unit_cost: current_unit_cost,
      unit: rest.base_unit,
      source: "manual",
    });
  }

  return NextResponse.json({ ingredient }, { status: 201 });
}
