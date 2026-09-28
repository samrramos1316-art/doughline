import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { markNotIngredient } from "@/lib/matching/review";

// "Not an ingredient": gloves, sanitizer, a deposit — lines a food invoice
// carries that no recipe uses. Resolves the line without matching it (so the
// invoice can complete and it stops counting toward the review gate, §6.3)
// and remembers the decision for this vendor's wording.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const result = await markNotIngredient(supabase, { lineItemId: id, userId: user.id });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}
