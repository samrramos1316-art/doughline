import { NextResponse, after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";
import { createIngredientFromLineItemSchema } from "@/lib/validators/lineItem";
import { confirmLineItem, UNRESOLVED_STATUSES } from "@/lib/matching/review";
import { embedTexts, ingredientEmbeddingText, toPgVector } from "@/lib/ai/embeddings/voyage";

// Voyage retries 429s on its free tier, so the embedding can take most of a
// minute. It runs after the response (below); this keeps it from being cut off.
export const maxDuration = 300;

const INGREDIENT_COLUMNS = "id, name, base_unit, category";

// Turn an unrecognized line into a new master ingredient and confirm the
// line against it in one step (§4).
//
// Safe to repeat: a retried or double-clicked request must not create a
// second ingredient. So an already-resolved line returns what it was matched
// to, and a name the org already has (case-insensitive — migration 024
// enforces it) reuses that ingredient instead of inserting.
//
// The new ingredient is embedded after the response is sent, so later
// invoices can vector-match it without the person waiting on Voyage.
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

  const { data: line } = await supabase
    .from("invoice_line_items")
    .select("id, match_status, matched_ingredient_id")
    .eq("id", id)
    .maybeSingle();
  if (!line) return NextResponse.json({ error: "Line item not found" }, { status: 404 });

  const unresolved = (UNRESOLVED_STATUSES as readonly string[]).includes(line.match_status);
  if (!unresolved && line.matched_ingredient_id) {
    const { data: ingredient } = await supabase
      .from("ingredients")
      .select(INGREDIENT_COLUMNS)
      .eq("id", line.matched_ingredient_id)
      .maybeSingle();
    return NextResponse.json({ ingredient, lineItem: line, alreadyMatched: true }, { status: 200 });
  }

  let ingredient = await findByName(supabase, parsed.data.name);
  let created = false;
  if (!ingredient) {
    const { data, error } = await supabase
      .from("ingredients")
      .insert({ ...parsed.data, org_id: orgId })
      .select(INGREDIENT_COLUMNS)
      .single();
    if (error?.code === "23505") {
      ingredient = await findByName(supabase, parsed.data.name); // lost a race with a concurrent create
    } else if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "Creating ingredient failed" }, { status: 400 });
    } else {
      ingredient = data;
      created = true;
    }
  }
  if (!ingredient) return NextResponse.json({ error: "Creating ingredient failed" }, { status: 400 });

  if (created) {
    const newIngredient = ingredient;
    after(async () => {
      try {
        const [embedding] = (await embedTexts([ingredientEmbeddingText(parsed.data)])).map(toPgVector);
        await supabase.from("ingredients").update({ embedding }).eq("id", newIngredient.id);
      } catch (err) {
        // It still exists; it just won't be vector-matchable until re-embedded.
        console.error(`[create-ingredient] embedding "${newIngredient.name}" failed; saved without one:`, err);
      }
    });
  }

  const result = await confirmLineItem(supabase, { lineItemId: id, ingredientId: ingredient.id, userId: user.id });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ingredient, reused: !created, ...result }, { status: created ? 201 : 200 });
}

async function findByName(supabase: Awaited<ReturnType<typeof createClient>>, name: string) {
  // ilike with the wildcards escaped is a case-insensitive equality check.
  const pattern = name.trim().replace(/[\\%_]/g, (c) => `\\${c}`);
  const { data } = await supabase.from("ingredients").select(INGREDIENT_COLUMNS).ilike("name", pattern).limit(1);
  return data?.[0] ?? null;
}
