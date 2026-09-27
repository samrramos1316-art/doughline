import { z } from "zod";

export const confirmLineItemSchema = z.object({
  ingredient_id: z.uuid(),
});

// The candidate the user just swiped left on. Sent explicitly (rather than
// "whatever is first") so a double-submit can't skip two candidates.
export const rejectLineItemSchema = z.object({
  ingredient_id: z.uuid(),
});

export const createIngredientFromLineItemSchema = z.object({
  name: z.string().trim().min(1),
  base_unit: z.string().trim().min(1),
  category: z.string().trim().optional(),
});

// §9.2 manual entry: one typed invoice row. Same fields the vision model
// extracts (§5.3), so it runs through the same matching and price pipeline.
const optionalNumber = z.number().nonnegative().nullable().optional();
const optionalText = z.string().trim().max(50).nullable().optional();
export const manualLineSchema = z.object({
  raw_text: z.string().trim().min(1, "Item is required").max(300),
  quantity: optionalNumber,
  unit: optionalText,
  unit_cost: optionalNumber,
  line_total: optionalNumber,
  pack_quantity: z.number().positive().nullable().optional(),
  pack_unit: optionalText,
});
export const createManualLinesSchema = z.object({
  lines: z.array(manualLineSchema).min(1).max(200),
});
export const updateLineItemSchema = manualLineSchema.partial();
