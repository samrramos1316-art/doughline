import { z } from "zod";

export const recipeIngredientSchema = z.object({
  ingredient_id: z.string().uuid(),
  quantity: z.coerce.number().positive(),
  unit: z.string().min(1),
});

export const createRecipeSchema = z.object({
  name: z.string().min(1),
  batch_yield_qty: z.coerce.number().positive(),
  batch_yield_unit: z.string().min(1),
  notes: z.string().optional(),
  ingredients: z.array(recipeIngredientSchema).default([]),
});

export const updateRecipeSchema = z.object({
  name: z.string().min(1).optional(),
  batch_yield_qty: z.coerce.number().positive().optional(),
  batch_yield_unit: z.string().min(1).optional(),
  notes: z.string().optional(),
  ingredients: z.array(recipeIngredientSchema).optional(),
});
