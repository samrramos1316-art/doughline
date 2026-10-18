import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { embedTexts, ingredientEmbeddingText, toPgVector } from "@/lib/ai/embeddings/voyage";
import { cleanPackSizes, sameUnit, type PackSizes } from "@/lib/costing/units";
import { packSizesAfterUnitChange, rebaseCost, rebaseRecipeLines, unitChangeFactorWith } from "@/lib/costing/rebaseUnit";

type Client = SupabaseClient<Database>;

export type IngredientRowInput = {
  // The row number the person sees (spreadsheet line, grid row), for errors.
  row?: number;
  id?: string | null;
  name: string;
  category?: string | null;
  base_unit: string;
  current_unit_cost?: number | string | null;
  commodity_code?: string | null;
  waste_pct?: number | string | null; // blank: new rows get the default, existing rows keep theirs
  // How many of the base unit in a bunch / a box (migration 028). Blank keeps
  // what's stored; 0 removes it.
  per_bunch?: number | string | null;
  per_box?: number | string | null;
  // For a base unit change with no fixed conversion (lb → case): how many
  // of the new unit are in one of the old (1/36 for a 36 lb case). Not
  // needed when the material already has a size for the new unit.
  new_unit_per_old?: number | string | null;
};

export type RowError = { row: number; field?: string; message: string };
export type RowOutcome = { row: number; id: string; name: string; action: "inserted" | "updated" | "unchanged"; changes: string[] };

// §9.2: the one write path behind both the ingredient grid and CSV import —
// the "fix it in a spreadsheet" escape hatch. Rows match an existing
// ingredient by id, else by name (case-insensitive), else are inserted.
// All-or-nothing on validation: any bad row and nothing is written, so a
// half-applied spreadsheet can't leave the list in a state nobody chose.
// Every new or renamed ingredient is embedded in ONE Voyage call. A cost
// change writes a 'manual' ingredient_price_history row, same as a
// single-ingredient edit. A blank cost on an existing row leaves it as is.
export async function bulkUpsertIngredients(
  supabase: Client,
  orgId: string,
  input: IngredientRowInput[],
  effectiveDate: string, // the business's local date (lib/dates/localDate.ts)
  // A new row's waste % when it gives none: the industry's default, 0 for
  // bought-in work (lib/industries newMaterialWastePct). 0 for food.
  defaultWastePct: (category: string | null) => number = () => 0,
): Promise<{ errors: RowError[] } | { outcomes: RowOutcome[]; embeddingError: string | null }> {
  const { data: existing, error: loadErr } = await supabase
    .from("ingredients")
    .select("id, name, category, base_unit, current_unit_cost, commodity_code, waste_pct, pack_sizes");
  if (loadErr) throw new Error(loadErr.message);
  const byId = new Map(existing.map((e) => [e.id, e]));
  const byName = new Map(existing.map((e) => [norm(e.name), e]));

  const errors: RowError[] = [];
  const seen = new Map<string, number>();
  const rows = input.map((r, i) => {
    const row = r.row ?? i + 1;
    const name = (r.name ?? "").trim();
    const base_unit = (r.base_unit ?? "").trim();
    const costText = r.current_unit_cost == null ? "" : String(r.current_unit_cost).trim().replace(/^\$/, "");
    const cost = costText === "" ? null : Number(costText);
    if (!name) errors.push({ row, field: "name", message: "Name is required" });
    if (!base_unit) errors.push({ row, field: "base_unit", message: "Base unit is required" });
    if (cost != null && (!Number.isFinite(cost) || cost < 0)) {
      errors.push({ row, field: "current_unit_cost", message: `"${costText}" isn't a cost` });
    }
    const wasteText = r.waste_pct == null ? "" : String(r.waste_pct).trim().replace(/%$/, "");
    const waste = wasteText === "" ? null : Number(wasteText);
    if (waste != null && !(Number.isFinite(waste) && waste >= 0 && waste < 100)) {
      errors.push({ row, field: "waste_pct", message: `"${wasteText}" isn't a waste % (0 to under 100)` });
    }
    const packs: Partial<Record<"bunch" | "box", number>> = {};
    for (const [unit, raw] of [["bunch", r.per_bunch], ["box", r.per_box]] as const) {
      const text = raw == null ? "" : String(raw).trim();
      if (text === "") continue;
      const n = Number(text);
      if (!Number.isFinite(n) || n < 0) errors.push({ row, field: `per_${unit}`, message: `"${text}" isn't a number per ${unit}` });
      else packs[unit] = n;
    }
    if (name) {
      const prior = seen.get(norm(name));
      if (prior) errors.push({ row, field: "name", message: `"${name}" also appears on row ${prior}` });
      seen.set(norm(name), row);
    }
    const perText = r.new_unit_per_old == null ? "" : String(r.new_unit_per_old).trim();
    const unitPer = perText === "" ? null : Number(perText);
    if (unitPer != null && !(Number.isFinite(unitPer) && unitPer > 0)) {
      errors.push({ row, field: "new_unit_per_old", message: `"${perText}" isn't a unit size` });
    }
    const id = r.id?.trim() || null;
    if (id && !byId.has(id)) errors.push({ row, field: "id", message: `No ingredient with id ${id} in this account` });
    const target = id ? byId.get(id) : byName.get(norm(name));
    return {
      row,
      target,
      name,
      base_unit,
      cost,
      waste,
      packs,
      unitPer,
      category: r.category?.trim() || null,
      commodity_code: r.commodity_code?.trim() || null,
    };
  });
  if (errors.length) return { errors };

  // A base unit change that doesn't convert on its own (lb → case, no case
  // size known) is refused when there's a price or recipe amounts to carry
  // over, rather than leaving them in the old unit.
  const factorOf = (r: (typeof rows)[number]) =>
    r.target && r.target.base_unit !== r.base_unit ? unitChangeFactorWith(r.target.base_unit, r.base_unit, cleanPackSizes(r.target.pack_sizes), r.unitPer) : null;
  const stuck = rows.filter((r) => r.target && r.target.base_unit !== r.base_unit && !sameUnit(r.target.base_unit, r.base_unit) && factorOf(r) == null);
  if (stuck.length) {
    const { data: used, error: usedErr } = await supabase.from("recipe_ingredients").select("ingredient_id").in("ingredient_id", stuck.map((r) => r.target!.id));
    if (usedErr) throw new Error(usedErr.message);
    const inRecipes = new Set((used ?? []).map((u) => u.ingredient_id));
    for (const r of stuck) {
      const t = r.target!;
      const priceToCarry = t.current_unit_cost != null && (r.cost == null || Number(t.current_unit_cost) === r.cost);
      if (priceToCarry || inRecipes.has(t.id)) {
        errors.push({ row: r.row, field: "base_unit", message: `${t.base_unit} → ${r.base_unit} doesn't convert on its own: give new_unit_per_old, how many ${r.base_unit} in one ${t.base_unit} (lb → a 36 lb case: 0.02777778)` });
      }
    }
    if (errors.length) return { errors };
  }

  const toEmbed = rows.filter((r) => !r.target || r.target.name !== r.name);
  let vectors: (string | null)[] = toEmbed.map(() => null);
  let embeddingError: string | null = null;
  if (toEmbed.length) {
    try {
      vectors = (await embedTexts(toEmbed.map((r) => ingredientEmbeddingText({ name: r.name })))).map(toPgVector);
    } catch (err) {
      embeddingError = err instanceof Error ? err.message : "Embedding failed";
      console.error("[ingredients] bulk embedding failed; saved without embeddings:", err);
    }
  }
  const vectorFor = new Map(toEmbed.map((r, i) => [r.row, vectors[i]]));

  const now = new Date().toISOString();
  const outcomes: RowOutcome[] = [];
  const history: Database["public"]["Tables"]["ingredient_price_history"]["Insert"][] = [];
  const rebased: { id: string; factor: number; unit: string }[] = [];

  const inserts = rows.filter((r) => !r.target);
  if (inserts.length) {
    const { data: created, error } = await supabase
      .from("ingredients")
      .insert(
        inserts.map((r) => ({
          org_id: orgId,
          name: r.name,
          category: r.category,
          base_unit: r.base_unit,
          commodity_code: r.commodity_code,
          current_unit_cost: r.cost,
          current_unit_cost_updated_at: r.cost != null ? now : null,
          waste_pct: r.waste ?? defaultWastePct(r.category),
          pack_sizes: withPacks({}, r.packs),
          embedding: vectorFor.get(r.row) ?? null,
        })),
      )
      .select("id, name");
    if (error) throw new Error(error.message);
    inserts.forEach((r, i) => {
      outcomes.push({ row: r.row, id: created[i].id, name: r.name, action: "inserted", changes: [] });
      if (r.cost != null) history.push({ org_id: orgId, ingredient_id: created[i].id, unit_cost: r.cost, unit: r.base_unit, source: "manual", effective_date: effectiveDate });
    });
  }

  for (const r of rows) {
    const t = r.target;
    if (!t) continue;
    const update: Database["public"]["Tables"]["ingredients"]["Update"] = {};
    const changes: string[] = [];
    if (t.name !== r.name) {
      update.name = r.name;
      update.embedding = vectorFor.get(r.row) ?? null;
      changes.push(`name "${t.name}" → "${r.name}"`);
    }
    if ((t.category ?? null) !== r.category) {
      update.category = r.category;
      changes.push(`category ${t.category ?? "—"} → ${r.category ?? "—"}`);
    }
    // A unit it converts to (lb → oz) carries the price, pack sizes and
    // recipe quantities over (lib/costing/rebaseUnit.ts), unless the row
    // also gives a new price.
    const factor = factorOf(r);
    if (t.base_unit !== r.base_unit) {
      update.base_unit = r.base_unit;
      changes.push(`base unit ${t.base_unit} → ${r.base_unit}`);
    }
    const priceGiven = r.cost != null && Number(t.current_unit_cost) !== r.cost;
    if (factor && !priceGiven && t.current_unit_cost != null) {
      update.current_unit_cost = rebaseCost(t.current_unit_cost, factor);
      changes.push(`cost ${t.current_unit_cost}/${t.base_unit} → ${update.current_unit_cost}/${r.base_unit}`);
    }
    if (factor) rebased.push({ id: t.id, factor, unit: r.base_unit });
    if ((t.commodity_code ?? null) !== r.commodity_code) {
      update.commodity_code = r.commodity_code;
      changes.push(`commodity ${t.commodity_code ?? "—"} → ${r.commodity_code ?? "—"}`);
    }
    const packsStored = cleanPackSizes(t.pack_sizes);
    const packsBefore = factor ? packSizesAfterUnitChange(packsStored, factor, t.base_unit, r.base_unit) : packsStored;
    // The grid sends every row's sizes as shown, in the old unit; after a
    // unit change, one that's the same as stored is the converted size.
    const packsGiven = factor ? Object.fromEntries(Object.entries(r.packs).filter(([unit, n]) => packsStored[unit] !== n)) : r.packs;
    const packsAfter = withPacks(packsBefore, packsGiven);
    for (const unit of ["bunch", "box"] as const) {
      if (packsBefore[unit] !== packsAfter[unit]) changes.push(`per ${unit} ${packsBefore[unit] ?? "—"} → ${packsAfter[unit] ?? "—"}`);
    }
    if (JSON.stringify(packsStored) !== JSON.stringify(packsAfter)) update.pack_sizes = packsAfter;
    if (r.waste != null && Number(t.waste_pct) !== r.waste) {
      update.waste_pct = r.waste;
      changes.push(`waste ${Number(t.waste_pct)}% → ${r.waste}%`);
    }
    if (priceGiven && r.cost != null) {
      update.current_unit_cost = r.cost;
      update.current_unit_cost_updated_at = now;
      changes.push(`cost ${t.current_unit_cost ?? "—"} → ${r.cost}`);
      history.push({ org_id: orgId, ingredient_id: t.id, unit_cost: r.cost, unit: r.base_unit, source: "manual", effective_date: effectiveDate });
    }
    if (changes.length) {
      update.updated_at = now;
      const { error } = await supabase.from("ingredients").update(update).eq("id", t.id);
      if (error) throw new Error(`row ${r.row}: ${error.message}`);
    }
    outcomes.push({ row: r.row, id: t.id, name: r.name, action: changes.length ? "updated" : "unchanged", changes });
  }

  for (const r of rebased) await rebaseRecipeLines(supabase, r.id, r.factor, r.unit);

  if (history.length) {
    const { error } = await supabase.from("ingredient_price_history").insert(history);
    if (error) throw new Error("recording price history failed: " + error.message);
  }

  outcomes.sort((a, b) => a.row - b.row);
  return { outcomes, embeddingError };
}

// Stored pack sizes with this row's bunch/box sizes applied: a number sets
// it, 0 removes it, left out keeps what was there.
function withPacks(stored: PackSizes, packs: Partial<Record<"bunch" | "box", number>>): PackSizes {
  const out = { ...stored };
  for (const [unit, n] of Object.entries(packs)) {
    if (n > 0) out[unit] = n;
    else delete out[unit];
  }
  return out;
}

function norm(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}
