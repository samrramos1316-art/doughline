import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { embedTexts, ingredientEmbeddingText, toPgVector } from "@/lib/ai/embeddings/voyage";

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
): Promise<{ errors: RowError[] } | { outcomes: RowOutcome[]; embeddingError: string | null }> {
  const { data: existing, error: loadErr } = await supabase
    .from("ingredients")
    .select("id, name, category, base_unit, current_unit_cost, commodity_code");
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
    if (name) {
      const prior = seen.get(norm(name));
      if (prior) errors.push({ row, field: "name", message: `"${name}" also appears on row ${prior}` });
      seen.set(norm(name), row);
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
      category: r.category?.trim() || null,
      commodity_code: r.commodity_code?.trim() || null,
    };
  });
  if (errors.length) return { errors };

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
    if (t.base_unit !== r.base_unit) {
      update.base_unit = r.base_unit;
      changes.push(`base unit ${t.base_unit} → ${r.base_unit}`);
    }
    if ((t.commodity_code ?? null) !== r.commodity_code) {
      update.commodity_code = r.commodity_code;
      changes.push(`commodity ${t.commodity_code ?? "—"} → ${r.commodity_code ?? "—"}`);
    }
    if (r.cost != null && Number(t.current_unit_cost) !== r.cost) {
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

  if (history.length) {
    const { error } = await supabase.from("ingredient_price_history").insert(history);
    if (error) throw new Error("recording price history failed: " + error.message);
  }

  outcomes.sort((a, b) => a.row - b.row);
  return { outcomes, embeddingError };
}

function norm(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}
