import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";
import { getVisionProvider } from "@/lib/ai/vision";
import { readOnboardingUpload } from "@/lib/onboarding/upload";
import { matchLines } from "@/lib/matching/vectorMatch";
import { SUGGESTION_DISPLAY_THRESHOLD } from "@/lib/matching/thresholds";
import { canonicalUnit, conversionFactor } from "@/lib/costing/units";
import { resolveRecipeLines, type LineDecision, type PriceListItem } from "@/lib/onboarding/reason";

// Claude (read, then reason), and one Voyage call for the lines (free-tier 429s retry).
export const maxDuration = 300;

type Pack = { qty: number; unit: string };

// §9.3: read a photo/PDF of a recipe into a draft — name, yield, ingredient
// lines — with every line matched to this org's price list. Nothing is
// written: the owner confirms on the review screen, which then creates the
// recipe (and any new ingredients) through the existing APIs.
//
// Two passes per line:
//   1. the invoice matcher (§5.2 step 5: alias → vector, same thresholds),
//      whose candidates become hints;
//   2. a reasoning pass (lib/onboarding/reason.ts) that picks the
//      ingredient this recipe actually uses (bread flour in a croissant,
//      all-purpose in a muffin) and the amount in that ingredient's unit —
//      cups → lb by density, eggs → fraction of a 15-dozen case.
// Exact conversions (g → lb, or lb → bags when the invoice gave the bag's
// size) are computed here, not taken from the model. If the reasoning pass
// fails, the matcher's answer stands, as it did before.
//
// Recipes are costed in each ingredient's base unit (the costing views
// ignore recipe_ingredients.unit), which is why every quantity is returned
// in it.
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
  const packs = await containerPacks(supabase, ingredients ?? []);

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
  const candidatesFor = (i: number) =>
    (matches?.[i]?.candidate_matches ?? []).filter((c) => c.similarity >= SUGGESTION_DISPLAY_THRESHOLD);

  let decisions: Map<number, LineDecision> | null = null;
  try {
    const priceList: PriceListItem[] = (ingredients ?? []).map((i) => {
      const p = packs.get(i.id);
      return { id: i.id, name: i.name, base_unit: i.base_unit, pack: p ? `1 ${i.base_unit} = ${p.qty} ${p.unit}` : null };
    });
    const out = await resolveRecipeLines({
      recipe_name: recipe.name_guess,
      yield: recipe.yield_qty_guess != null ? `${recipe.yield_qty_guess} ${recipe.yield_unit_guess ?? ""}`.trim() : null,
      lines: recipe.ingredient_lines.map((l, index) => ({
        index,
        raw_text: l.raw_text,
        quantity: l.quantity_guess,
        unit: l.unit_guess,
        item_name: l.item_name_guess,
        suggestions: candidatesFor(index).map((c) => c.name),
      })),
      price_list: priceList,
    });
    decisions = new Map(out.map((d) => [d.index, d]));
  } catch (err) {
    console.error("[onboarding] recipe reasoning failed; using the matcher alone:", err);
  }

  const lines = recipe.ingredient_lines.map((l, i) => {
    const m = matches?.[i];
    const candidates = candidatesFor(i);
    const d = decisions?.get(i);

    if (d) {
      const chosen = d.ingredient_id && byId.has(d.ingredient_id) ? byId.get(d.ingredient_id)! : null;
      if (chosen) {
        const exact = exactQuantity(l.quantity_guess, l.unit_guess, chosen.base_unit, packs.get(chosen.id));
        const quantity = exact ?? positive(d.quantity_in_unit);
        // Keep the reasoning pass's pick visible in the dropdown's suggestions.
        const withChosen = candidates.some((c) => c.ingredient_id === chosen.id)
          ? candidates
          : [{ ingredient_id: chosen.id, name: chosen.name, similarity: m?.candidate_matches?.find((c) => c.ingredient_id === chosen.id)?.similarity ?? 0 }, ...candidates];
        return {
          ...l,
          match_status: d.confidence === "high" && quantity != null ? "auto_matched" : "needs_review",
          matched_ingredient_id: chosen.id,
          match_confidence: m?.match_confidence ?? null,
          candidates: withChosen,
          base_unit: chosen.base_unit,
          base_quantity: quantity,
          note: d.note,
        };
      }
      if (!d.new_ingredient_name) {
        // Water, ice: no cost, left out of the recipe by default.
        return { ...l, match_status: "free", matched_ingredient_id: null, match_confidence: null, candidates, base_unit: null, base_quantity: null, note: d.note };
      }
      const unit = canonicalUnit(d.new_ingredient_unit) ?? d.new_ingredient_unit ?? "lb";
      const exact = exactQuantity(l.quantity_guess, l.unit_guess, unit, undefined);
      return {
        ...l,
        match_status: "new_ingredient",
        matched_ingredient_id: null,
        match_confidence: null,
        candidates,
        base_unit: null,
        base_quantity: null,
        new_ingredient: { name: d.new_ingredient_name, unit, quantity: exact ?? positive(d.quantity_in_unit) },
        note: d.note,
      };
    }

    // No reasoning pass: the matcher's answer, exact conversions only.
    const matchedId = m?.matched_ingredient_id ?? (m?.match_status === "needs_review" ? candidates[0]?.ingredient_id ?? null : null);
    const ing = matchedId ? byId.get(matchedId) : undefined;
    return {
      ...l,
      match_status: m?.match_status === "not_ingredient" ? "new_ingredient" : m?.match_status ?? "new_ingredient",
      matched_ingredient_id: matchedId,
      match_confidence: m?.match_confidence ?? null,
      candidates,
      base_unit: ing?.base_unit ?? null,
      base_quantity: ing ? exactQuantity(l.quantity_guess, l.unit_guess, ing.base_unit, packs.get(ing.id)) : null,
    };
  });
  return NextResponse.json({ recipe, lines });
}

const positive = (n: number | null | undefined) => (n != null && Number.isFinite(n) && n > 0 ? Math.round(n * 10000) / 10000 : null);

// A recipe amount in `base` when it's pure arithmetic: same kind of unit
// (g → lb), a bare count for an "each" ingredient, or through the container's
// printed size (250 g of flour from "1 bag = 50 lb" → 0.011 bag; 3 eggs from
// "1 case = 15 dozen" → 0.0167 case). null when it needs a density or a guess.
function exactQuantity(qty: number | null, unit: string | null, base: string, pack: Pack | undefined): number | null {
  if (qty == null) return null;
  const from = unit ?? "each";
  const direct = conversionFactor(from, base);
  if (direct != null) return positive(qty * direct);
  if (pack) {
    const toPack = conversionFactor(from, pack.unit);
    if (toPack != null) return positive((qty * toPack) / pack.qty);
  }
  return null;
}

// For ingredients bought and costed per container (bag, case, flat), what
// one holds — from the newest invoice line that printed a pack size.
async function containerPacks(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ingredients: { id: string; base_unit: string }[],
): Promise<Map<string, Pack>> {
  const ids = ingredients.filter((i) => !canonicalUnit(i.base_unit)).map((i) => i.id);
  const packs = new Map<string, Pack>();
  if (!ids.length) return packs;
  const { data } = await supabase
    .from("invoice_line_items")
    .select("matched_ingredient_id, parsed_pack_quantity, parsed_pack_unit, created_at")
    .in("matched_ingredient_id", ids)
    .not("parsed_pack_quantity", "is", null)
    .order("created_at", { ascending: false });
  for (const row of data ?? []) {
    const unit = canonicalUnit(row.parsed_pack_unit);
    if (!row.matched_ingredient_id || packs.has(row.matched_ingredient_id) || !unit || !row.parsed_pack_quantity) continue;
    packs.set(row.matched_ingredient_id, { qty: Number(row.parsed_pack_quantity), unit });
  }
  return packs;
}
