import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";
import { getVisionProvider } from "@/lib/ai/vision";
import { readOnboardingUpload } from "@/lib/onboarding/upload";

export const maxDuration = 300;

// §9.3: read a photo/PDF of a menu into draft { name_guess, price_guess }
// rows for the onboarding review table. Nothing is written — the owner
// confirms rows, and each becomes POST /api/menu-items.
export async function POST(request: Request) {
  const supabase = await createClient();
  const orgId = await getCurrentOrgId(supabase);
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const file = await readOnboardingUpload(supabase, orgId, await request.json().catch(() => null));
  if ("error" in file) return NextResponse.json({ error: file.error }, { status: file.status });

  try {
    const { items } = await getVisionProvider().extractMenu(file.buffer, file.mimeType);
    return NextResponse.json({ items: items.filter((i) => i.name_guess.trim()) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't read this menu" }, { status: 502 });
  }
}
