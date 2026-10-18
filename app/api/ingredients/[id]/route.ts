import { NextResponse } from "next/server";
import { localDateFrom } from "@/lib/dates/localDate";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";
import { updateIngredientSchema } from "@/lib/validators/ingredient";
import { INGREDIENT_COLUMNS } from "@/lib/supabase/columns";
import { embedTexts, ingredientEmbeddingText, toPgVector } from "@/lib/ai/embeddings/voyage";
import { retryUnappliedPrices } from "@/lib/costing/retryPrices";
import { packSizesAfterUnitChange, rebaseCost, rebaseRecipeLines, unitChangeFactorWith } from "@/lib/costing/rebaseUnit";
import { cleanPackSizes, sameUnit, type PackSizes } from "@/lib/costing/units";

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
  const { current_unit_cost, new_unit_per_old, ...rest } = parsed.data;

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

  // A new base unit carries the price, pack sizes and recipe quantities
  // over, unless a new price comes with it: by the fixed conversion (lb →
  // oz), else by a size (lb → a 36 lb case). With neither, the change is
  // refused when there's a price or recipe amounts to carry.
  let unitFactor: number | null = null;
  const rebase: { current_unit_cost?: number | null; pack_sizes?: PackSizes } = {};
  if (rest.base_unit != null) {
    const { data: before } = await supabase.from("ingredients").select("base_unit, current_unit_cost, pack_sizes").eq("id", id).single();
    const packs = cleanPackSizes(before?.pack_sizes);
    unitFactor = before ? unitChangeFactorWith(before.base_unit, rest.base_unit, packs, new_unit_per_old) : null;
    if (before && !unitFactor && !sameUnit(before.base_unit, rest.base_unit)) {
      const { count } = await supabase.from("recipe_ingredients").select("id", { count: "exact", head: true }).eq("ingredient_id", id);
      if ((before.current_unit_cost != null && current_unit_cost == null) || (count ?? 0) > 0) {
        return NextResponse.json(
          { error: `${before.base_unit} → ${rest.base_unit} doesn't convert on its own: send new_unit_per_old, how many ${rest.base_unit} in one ${before.base_unit}` },
          { status: 400 },
        );
      }
    }
    if (before && unitFactor) {
      if (current_unit_cost == null) rebase.current_unit_cost = rebaseCost(before.current_unit_cost, unitFactor);
      const after = packSizesAfterUnitChange(packs, unitFactor, before.base_unit, rest.base_unit);
      if (JSON.stringify(after) !== JSON.stringify(packs)) rebase.pack_sizes = after;
    }
  }

  const updates = {
    ...rest,
    ...rebase,
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
  if (error?.code === "23505") {
    return NextResponse.json({ error: "You already have an ingredient with that name" }, { status: 409 });
  }
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

  if (unitFactor && rest.base_unit != null) {
    try {
      await rebaseRecipeLines(supabase, id, unitFactor, rest.base_unit);
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Converting recipe lines failed" }, { status: 500 });
    }
  }

  // A new base unit may be one this ingredient's stuck invoice prices can
  // now convert to.
  const prices = rest.base_unit != null ? await retryUnappliedPrices(supabase, [id]) : [];

  return NextResponse.json({ ingredient, prices_applied: prices.filter((p) => p.applied).length });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { error } = await supabase.from("ingredients").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
