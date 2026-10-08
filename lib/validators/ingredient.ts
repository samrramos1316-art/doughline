import { z } from "zod";

export const createIngredientSchema = z.object({
  name: z.string().min(1),
  category: z.string().optional(),
  base_unit: z.string().min(1),
  current_unit_cost: z.coerce.number().nonnegative().optional(),
  commodity_code: z.string().optional(),
  // Waste/loss % (migration 027): what's bought but lost to trim, scrap or
  // spoilage; every recipe line using the material follows it unless it
  // has its own. Left out on create: the industry's default (0 for food).
  waste_pct: z.coerce.number().min(0, "Waste can't be negative").lt(100, "Waste must be under 100%").optional(),
});

export const updateIngredientSchema = createIngredientSchema.partial();
