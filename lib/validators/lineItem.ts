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
