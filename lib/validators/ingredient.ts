import { z } from "zod";

export const createIngredientSchema = z.object({
  name: z.string().min(1),
  category: z.string().optional(),
  base_unit: z.string().min(1),
  current_unit_cost: z.coerce.number().nonnegative().optional(),
  commodity_code: z.string().optional(),
});

export const updateIngredientSchema = createIngredientSchema.partial();
