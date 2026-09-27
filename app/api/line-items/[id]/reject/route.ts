import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rejectLineItemSchema } from "@/lib/validators/lineItem";
import { parseCandidates } from "@/lib/matching/review";

// Swipe left (§5.2 step 7): drop the rejected candidate. The next candidate
// becomes the one shown; with none left the line becomes 'new_ingredient'
// ("No match found"). A 'new_ingredient' line can be rejected too — its
// low-confidence suggestion — and stays 'new_ingredient'.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const parsed = rejectLineItemSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const { data: line, error: lineErr } = await supabase
    .from("invoice_line_items")
    .select("id, match_status, candidate_matches")
    .eq("id", id)
    .single();
  if (lineErr || !line) return NextResponse.json({ error: "Line item not found" }, { status: 404 });
  if (line.match_status !== "needs_review" && line.match_status !== "new_ingredient") {
    return NextResponse.json({ error: `Line item is '${line.match_status}', not awaiting review` }, { status: 409 });
  }

  const remaining = parseCandidates(line.candidate_matches).filter(
    (c) => c.ingredient_id !== parsed.data.ingredient_id,
  );
  const { data: updated, error: updateErr } = await supabase
    .from("invoice_line_items")
    .update(
      remaining.length > 0
        ? { candidate_matches: remaining, match_confidence: remaining[0].similarity }
        : { candidate_matches: null, match_confidence: null, match_status: "new_ingredient" },
    )
    .eq("id", id)
    .select()
    .single();
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 400 });

  return NextResponse.json({ lineItem: updated });
}
