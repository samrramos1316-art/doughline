import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { confirmLineItemSchema } from "@/lib/validators/lineItem";
import { confirmLineItem } from "@/lib/matching/review";

// Swipe right (§5.2 step 7): confirm the shown candidate, or any ingredient
// the user picked instead.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const parsed = confirmLineItemSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const result = await confirmLineItem(supabase, {
    lineItemId: id,
    ingredientId: parsed.data.ingredient_id,
    userId: user.id,
  });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}
