import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";
import { createIngredientFromLineItemSchema } from "@/lib/validators/lineItem";
import { confirmLineItem } from "@/lib/matching/review";
import { embedTexts, ingredientEmbeddingText, toPgVector } from "@/lib/ai/embeddings/voyage";

// Claude and Voyage calls (Voyage retries 429s on its free tier) can take
// most of a minute; don't let the platform's default timeout cut them off.
export const maxDuration = 300;

// Turn an unrecognized line into a new master ingredient and confirm the
// line against it in one step (§4). The new ingredient is embedded right
// away so later invoices can vector-match it.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const orgId = await getCurrentOrgId(supabase);
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const parsed = createIngredientFromLineItemSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const { data: line } = await supabase.from("invoice_line_items").select("id").eq("id", id).maybeSingle();
  if (!line) return NextResponse.json({ error: "Line item not found" }, { status: 404 });

  let embedding: string | null = null;
  try {
    [embedding] = (await embedTexts([ingredientEmbeddingText(parsed.data)])).map(toPgVector);
  } catch (err) {
    // Still create it; it just won't be vector-matchable until re-embedded.
    console.error(`[create-ingredient] embedding "${parsed.data.name}" failed; saved without one:`, err);
  }

  const { data: ingredient, error: ingErr } = await supabase
    .from("ingredients")
    .insert({ ...parsed.data, org_id: orgId, embedding })
    .select("id, name, base_unit, category")
    .single();
  if (ingErr || !ingredient) {
    return NextResponse.json({ error: ingErr?.message ?? "Creating ingredient failed" }, { status: 400 });
  }

  const result = await confirmLineItem(supabase, { lineItemId: id, ingredientId: ingredient.id, userId: user.id });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ingredient, ...result }, { status: 201 });
}
