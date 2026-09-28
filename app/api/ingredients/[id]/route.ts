import { NextResponse } from "next/server";
import { localDateFrom } from "@/lib/dates/localDate";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";
import { updateIngredientSchema } from "@/lib/validators/ingredient";
import { INGREDIENT_COLUMNS } from "@/lib/supabase/columns";
import { embedTexts, ingredientEmbeddingText, toPgVector } from "@/lib/ai/embeddings/voyage";

// Claude and Voyage calls (Voyage retries 429s on its free tier) can take
// most of a minute; don't let the platform's default timeout cut them off.
export const maxDuration = 300;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const orgId = await getCurrentOrgId(supabase);
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const parsed = updateIngredientSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const { current_unit_cost, ...rest } = parsed.data;

  // §4: re-embed when the name changes, so matching follows the new name.
  // On a Voyage failure the old embedding is cleared rather than left
  // describing a name the ingredient no longer has.
  let embeddingUpdate: { embedding: string | null } | Record<string, never> = {};
  if (rest.name != null) {
    try {
      const [vector] = await embedTexts([ingredientEmbeddingText({ name: rest.name })]);
      embeddingUpdate = { embedding: toPgVector(vector) };
    } catch (err) {
      console.error(`[ingredients] re-embedding ${id} failed; embedding cleared:`, err);
      embeddingUpdate = { embedding: null };
    }
  }

  const updates = {
    ...rest,
    ...embeddingUpdate,
    ...(current_unit_cost != null
      ? { current_unit_cost, current_unit_cost_updated_at: new Date().toISOString() }
      : {}),
  };

  const { data: ingredient, error } = await supabase
    .from("ingredients")
    .update(updates)
    .eq("id", id)
    .select(INGREDIENT_COLUMNS)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (current_unit_cost != null) {
    await supabase.from("ingredient_price_history").insert({
      org_id: orgId,
      ingredient_id: id,
      unit_cost: current_unit_cost,
      unit: ingredient.base_unit,
      source: "manual",
      effective_date: localDateFrom(request),
    });
  }

  return NextResponse.json({ ingredient });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { error } = await supabase.from("ingredients").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
