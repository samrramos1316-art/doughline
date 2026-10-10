import { z } from "zod";

// Waste, labor and overhead (migration 025) are optional everywhere: left
// out, labor and overhead default to 0 (and the labor rate to null = the
// org's default rate), and a line's waste to null = its material's waste %
// (migration 027), so a food recipe costs what it always did.
export const recipeIngredientSchema = z.object({
  ingredient_id: z.string().uuid(),
  quantity: z.coerce.number().positive(),
  unit: z.string().min(1),
  waste_pct: z.coerce.number().min(0, "Waste can't be negative").lt(100, "Waste must be under 100%").nullable().optional(),
});

const laborOverhead = {
  labor_minutes: z.coerce.number().min(0, "Labor minutes can't be negative").max(999999).optional(),
  labor_rate_per_hour: z.coerce.number().min(0, "Hourly rate can't be negative").max(999999).nullable().optional(),
  overhead_pct: z.coerce.number().min(0, "Overhead can't be negative").max(999).optional(),
  // Machine time (migration 029); null rate = the org's default machine rate.
  machine_minutes: z.coerce.number().min(0, "Machine minutes can't be negative").max(999999).optional(),
  machine_rate_per_hour: z.coerce.number().min(0, "Machine rate can't be negative").max(999999).nullable().optional(),
};

export const createRecipeSchema = z.object({
  name: z.string().min(1),
  batch_yield_qty: z.coerce.number().positive(),
  batch_yield_unit: z.string().min(1),
  notes: z.string().optional(),
  ...laborOverhead,
  ingredients: z.array(recipeIngredientSchema).default([]),
});

export const updateRecipeSchema = z.object({
  name: z.string().min(1).optional(),
  batch_yield_qty: z.coerce.number().positive().optional(),
  batch_yield_unit: z.string().min(1).optional(),
  notes: z.string().optional(),
  ...laborOverhead,
  ingredients: z.array(recipeIngredientSchema).optional(),
});
