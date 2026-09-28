import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";
import { linkMenuToRecipes } from "@/lib/onboarding/reason";

export const maxDuration = 120;

const schema = z.object({
  menu: z.array(z.object({ key: z.string(), name: z.string(), price: z.number().nullable() })).min(1).max(200),
  recipes: z
    .array(
      z.object({
        key: z.string(),
        name: z.string(),
        yield_qty: z.number().nullable(),
        yield_unit: z.string().nullable(),
        ingredients: z.array(z.string()).max(60),
      }),
    )
    .min(1)
    .max(200),
});

// §9.3: which recipe each menu item is made from, and how many of it one
// batch makes — decided by what the item is, not by shared words
// (lib/onboarding/reason.ts). Suggestions only: the review screen shows
// them in editable dropdowns and nothing is saved here.
export async function POST(request: Request) {
  const supabase = await createClient();
  const orgId = await getCurrentOrgId(supabase);
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });

  try {
    const links = await linkMenuToRecipes(parsed.data);
    const recipeKeys = new Set(parsed.data.recipes.map((r) => r.key));
    return NextResponse.json({
      links: links
        .filter((l) => parsed.data.menu.some((m) => m.key === l.key))
        .map((l) => ({
          key: l.key,
          recipe_key: l.recipe_key && recipeKeys.has(l.recipe_key) ? l.recipe_key : null,
          servings_per_batch: l.servings_per_batch != null && l.servings_per_batch > 0 ? l.servings_per_batch : null,
          note: l.note,
        })),
    });
  } catch (err) {
    console.error("[onboarding] menu linking failed:", err);
    return NextResponse.json({ error: "Couldn't suggest recipe links" }, { status: 502 });
  }
}
