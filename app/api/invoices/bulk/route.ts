import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";
import { bulkCreateInvoicesSchema } from "@/lib/validators/invoice";
import { getReviewBacklog } from "@/lib/matching/review";

// §9.1: create every invoice row of a multi-file backfill in one request,
// after the files are already in Storage. The client then works through
// POST /api/invoices/[id]/scan for each, as a queue.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const orgId = await getCurrentOrgId(supabase);
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  // §6.3 applies to backfills too: no new invoices while over the review cap.
  const backlog = await getReviewBacklog(supabase, orgId);
  if (backlog.blocked) {
    return NextResponse.json(
      {
        error: `Review ${backlog.unresolved - backlog.cap} more line item(s) before importing — ${backlog.unresolved} are waiting (limit ${backlog.cap}).`,
        review_backlog: backlog,
      },
      { status: 423 },
    );
  }

  const parsed = bulkCreateInvoicesSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  for (const inv of parsed.data.invoices) {
    if (!inv.file_storage_path.startsWith(`${orgId}/`)) {
      return NextResponse.json({ error: "file_storage_path does not match caller's org" }, { status: 400 });
    }
    if ((inv.file_type === "pdf") !== inv.file_storage_path.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ error: `file_type '${inv.file_type}' doesn't match ${inv.file_storage_path}` }, { status: 400 });
    }
  }

  const { data: invoices, error } = await supabase
    .from("invoices")
    .insert(
      parsed.data.invoices.map((inv) => ({
        id: inv.id,
        org_id: orgId,
        uploaded_by: user.id,
        file_storage_path: inv.file_storage_path,
        file_type: inv.file_type,
        source_type: "bulk_upload",
        status: "pending",
      })),
    )
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ invoice_ids: invoices.map((i) => i.id) }, { status: 201 });
}
