import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";
import { createInvoiceSchema } from "@/lib/validators/invoice";
import { getReviewBacklog } from "@/lib/matching/review";

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invoices")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ invoices: data });
}

// Called after the compressed file is already sitting in Storage (§4 API
// table) — this just records the row. `id` comes from the client because the
// Storage path (`{org_id}/{invoice_id}.{ext}`) already embeds it.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const orgId = await getCurrentOrgId(supabase);
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  // §6.3: no new scans while the org's review backlog is over its cap.
  const backlog = await getReviewBacklog(supabase, orgId);
  if (backlog.blocked) {
    return NextResponse.json(
      {
        error: `Review ${backlog.unresolved - backlog.cap} more line item(s) before scanning — ${backlog.unresolved} are waiting (limit ${backlog.cap}).`,
        review_backlog: backlog,
      },
      { status: 423 },
    );
  }

  const parsed = createInvoiceSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const { id, file_storage_path, file_type, vendor_id } = parsed.data;

  // The client picks the path; Storage RLS already scopes uploads to the
  // caller's own org folder, but don't trust a client-supplied string for a
  // column write without checking it matches here too.
  if (!file_storage_path.startsWith(`${orgId}/`)) {
    return NextResponse.json({ error: "file_storage_path does not match caller's org" }, { status: 400 });
  }

  const { data: invoice, error } = await supabase
    .from("invoices")
    .insert({
      id,
      org_id: orgId,
      vendor_id: vendor_id ?? null,
      uploaded_by: user.id,
      file_storage_path,
      file_type,
      source_type: "camera_scan",
      status: "pending",
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ invoice_id: invoice.id, invoice }, { status: 201 });
}
