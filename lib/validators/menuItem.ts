import { z } from "zod";

export const createMenuItemSchema = z.object({
  name: z.string().min(1),
  recipe_id: z.string().uuid().optional(),
  selling_price: z.coerce.number().nonnegative(),
  servings_per_batch: z.coerce.number().positive().optional(),
  is_active: z.boolean().optional(),
});

export const updateMenuItemSchema = createMenuItemSchema.partial();
