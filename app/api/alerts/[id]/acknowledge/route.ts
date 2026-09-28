import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Mark a price alert handled (or reopen it): it leaves the inbox and the
// Alerts badge but stays in the history with its margin impacts.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const acknowledged = body.acknowledged !== false;
  const supabase = await createClient();
  const { data, error } = await supabase.from("price_alerts").update({ acknowledged }).eq("id", id).select("id, acknowledged").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "Alert not found" }, { status: 404 });
  return NextResponse.json({ alert: data });
}
