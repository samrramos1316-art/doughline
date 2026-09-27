import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAlertSuggestions } from "@/lib/suggestions/engine";

// §8: the deterministic options for every menu item an alert affected, plus
// the cached Claude narrative if one has been generated (POST …/narrative).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const suggestions = await getAlertSuggestions(supabase, id);
  if (!suggestions) return NextResponse.json({ error: "Alert not found" }, { status: 404 });
  return NextResponse.json(suggestions);
}
