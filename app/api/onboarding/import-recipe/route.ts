import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";
import { getVisionProvider } from "@/lib/ai/vision";
import { readOnboardingUpload } from "@/lib/onboarding/upload";
import { matchLines } from "@/lib/matching/vectorMatch";
import { SUGGESTION_DISPLAY_THRESHOLD } from "@/lib/matching/thresholds";
import { conversionFactor } from "@/lib/costing/units";

// Claude, then one Voyage call for the lines (free-tier 429s retry).
export const maxDuration = 300;

// §9.3: read a photo/PDF of a recipe into a draft — name, yield, ingredient
// lines — with every line already run through the invoice matcher (§5.2
// step 5, same thresholds) against this org's ingredients. Nothing is
// written: the owner confirms on the review screen, which then creates the
// recipe (and any new ingredients) through the existing APIs.
//
// Recipes are costed in each ingredient's base unit (the costing views
// ignore recipe_ingredients.unit), so each matched line also carries its
// quantity converted to that unit when the units measure the same thing
// (grams → lb). Cups of flour → lb needs a density, so it's left for the
// owner to fill in rather than guessed.
export async function POST(request: Request) {
  const supabase = await createClient();
  const orgId = await getCurrentOrgId(supabase);
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const file = await readOnboardingUpload(supabase, orgId, await request.json().catch(() => null));
  if ("error" in file) return NextResponse.json({ error: file.error }, { status: file.status });

  let recipe;
  try {
    recipe = await getVisionProvider().extractRecipe(file.buffer, file.mimeType);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't read this recipe" }, { status: 502 });
  }
  if (!recipe.ingredient_lines.length) return NextResponse.json({ recipe, lines: [] });

  const { data: ingredients } = await supabase.from("ingredients").select("id, name, base_unit");
  const byId = new Map((ingredients ?? []).map((i) => [i.id, i]));
  let matches: Awaited<ReturnType<typeof matchLines>> | null = null;
  if ((ingredients ?? []).length) {
    try {
      matches = await matchLines(supabase, {
        vendorId: null,
        recordAliasUse: false,
        lines: recipe.ingredient_lines.map((l) => ({ raw_text: l.raw_text, item_name: l.item_name_guess })),
      });
    } catch (err) {
      // Matching is a convenience here; without it every line just asks.
      console.error("[onboarding] recipe line matching failed:", err);
    }
  }

  const lines = recipe.ingredient_lines.map((l, i) => {
    const m = matches?.[i];
    const candidates = (m?.candidate_matches ?? []).filter((c) => c.similarity >= SUGGESTION_DISPLAY_THRESHOLD);
    const matchedId = m?.matched_ingredient_id ?? (m?.match_status === "needs_review" ? candidates[0]?.ingredient_id ?? null : null);
    const base = matchedId ? byId.get(matchedId)?.base_unit ?? null : null;
    const factor = base && l.quantity_guess != null ? (l.unit_guess ? conversionFactor(l.unit_guess, base) : base === "each" ? 1 : null) : null;
    return {
      ...l,
      match_status: m?.match_status === "not_ingredient" ? "new_ingredient" : m?.match_status ?? "new_ingredient",
      matched_ingredient_id: matchedId,
      match_confidence: m?.match_confidence ?? null,
      candidates,
      base_unit: base,
      base_quantity: factor != null && l.quantity_guess != null ? Math.round(l.quantity_guess * factor * 10000) / 10000 : null,
    };
  });
  return NextResponse.json({ recipe, lines });
}
