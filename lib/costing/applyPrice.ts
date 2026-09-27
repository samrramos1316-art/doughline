import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { toBaseUnitCost } from "./units";

type Client = SupabaseClient<Database>;

export type PriceOutcome =
  | {
      applied: true;
      basis: string;
      previous_unit_cost: number | null;
      new_unit_cost: number;
      pct_change: number | null;
      threshold_pct: number;
      price_alert_id: string | null;
      impacts: number;
    }
  | { applied: false; reason: string };

// §5.2 step 8 / §6.1: once a line is matched to an ingredient (human
// confirm, or auto-match at scan), convert its invoice price to the
// ingredient's base unit and hand it to apply_line_item_price() (migration
// 017), which records the price history, moves current_unit_cost, and — past
// the org's alert threshold — writes the price_alerts row and the
// menu_item_margin_impacts cascade, all in one transaction.
//
// Never throws: a price that can't be applied must not undo the match the
// human just made. The reason is stored on the line (price_note) instead.
export async function applyLinePrice(supabase: Client, lineItemId: string): Promise<PriceOutcome> {
  const { data: line, error } = await supabase
    .from("invoice_line_items")
    .select(
      "id, parsed_unit_cost, parsed_unit, parsed_pack_quantity, parsed_pack_unit, price_applied_at, ingredients(base_unit)",
    )
    .eq("id", lineItemId)
    .single();
  if (error || !line) return { applied: false, reason: "Line item not found" };
  if (line.price_applied_at) return { applied: false, reason: "already_applied" };
  if (!line.ingredients) return { applied: false, reason: "Line item is not matched to an ingredient" };

  const converted = toBaseUnitCost(
    {
      unit_cost: line.parsed_unit_cost,
      unit: line.parsed_unit,
      pack_quantity: line.parsed_pack_quantity,
      pack_unit: line.parsed_pack_unit,
    },
    line.ingredients.base_unit,
  );
  if (!converted.ok) {
    await supabase.from("invoice_line_items").update({ price_note: converted.note }).eq("id", lineItemId);
    return { applied: false, reason: converted.note };
  }

  const { data, error: rpcErr } = await supabase.rpc("apply_line_item_price", {
    p_line_item_id: lineItemId,
    p_base_unit_cost: converted.cost,
  });
  if (rpcErr || !data) {
    const reason = "Applying price failed: " + (rpcErr?.message ?? "no result");
    console.error(`[price] line ${lineItemId}: ${reason}`);
    await supabase.from("invoice_line_items").update({ price_note: reason }).eq("id", lineItemId);
    return { applied: false, reason };
  }

  const result = data as {
    applied: boolean;
    reason?: string;
    previous_unit_cost: number | null;
    new_unit_cost: number;
    pct_change: number | null;
    threshold_pct: number;
    price_alert_id: string | null;
    impacts: number;
  };
  if (!result.applied) return { applied: false, reason: result.reason ?? "not applied" };
  return {
    applied: true,
    basis: converted.basis,
    previous_unit_cost: result.previous_unit_cost,
    new_unit_cost: result.new_unit_cost,
    pct_change: result.pct_change,
    threshold_pct: result.threshold_pct,
    price_alert_id: result.price_alert_id,
    impacts: result.impacts,
  };
}
