import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAlertSuggestions } from "@/lib/suggestions/engine";
import { generateAlertNarrative, NARRATIVE_MODEL } from "@/lib/suggestions/narrative";

// Claude and Voyage calls (Voyage retries 429s on its free tier) can take
// most of a minute; don't let the platform's default timeout cut them off.
export const maxDuration = 300;

// §8: the optional Claude narrative — one call per alert, cached on the
// price_alerts row. Returns the cached one unless ?refresh=1.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const refresh = new URL(request.url).searchParams.get("refresh") === "1";
  const supabase = await createClient();

  const suggestions = await getAlertSuggestions(supabase, id);
  if (!suggestions) return NextResponse.json({ error: "Alert not found" }, { status: 404 });
  if (suggestions.alert.ai_narrative && !refresh) {
    return NextResponse.json({
      narrative: suggestions.alert.ai_narrative,
      model: suggestions.alert.ai_narrative_model,
      generated_at: suggestions.alert.ai_narrative_generated_at,
      cached: true,
    });
  }

  let narrative: string;
  try {
    narrative = await generateAlertNarrative(suggestions);
  } catch (err) {
    console.error(`[narrative] alert ${id}:`, err);
    // The deterministic suggestions stand on their own; the narrative is optional.
    return NextResponse.json({ error: "Couldn't generate the AI summary right now" }, { status: 502 });
  }

  const generatedAt = new Date().toISOString();
  const { error } = await supabase
    .from("price_alerts")
    .update({ ai_narrative: narrative, ai_narrative_model: NARRATIVE_MODEL, ai_narrative_generated_at: generatedAt })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ narrative, model: NARRATIVE_MODEL, generated_at: generatedAt, cached: false });
}
