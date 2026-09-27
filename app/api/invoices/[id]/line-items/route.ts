import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createManualLinesSchema } from "@/lib/validators/lineItem";
import { insertAndMatchLines } from "@/lib/invoices/lines";
import { expandItemNames } from "@/lib/ai/itemNames";

// Voyage embeds every typed line, and on its free tier retries 429s.
export const maxDuration = 300;

// §9.2: typed invoice lines — for a 'failed' invoice the vision model
// couldn't read, or to add a line a scan missed. They go through the same
// alias → vector → routing → price pipeline as scanned lines.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const parsed = createManualLinesSchema.safeParse(await request.json());
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: issue ? `${issue.path.join(".")}: ${issue.message}` : "Invalid input" }, { status: 400 });
  }
  const { data: invoice } = await supabase.from("invoices").select("id, org_id, vendor_id").eq("id", id).maybeSingle();
  if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  const itemNames = await expandItemNames(parsed.data.lines.map((l) => l.raw_text));
  try {
    const result = await insertAndMatchLines(supabase, {
      orgId: invoice.org_id,
      invoiceId: id,
      vendorId: invoice.vendor_id,
      entryMethod: "manual",
      lines: parsed.data.lines.map((l, i) => ({
        raw_text: l.raw_text,
        item_name: itemNames[i],
        quantity: l.quantity ?? null,
        unit: l.unit || null,
        unit_cost: l.unit_cost ?? null,
        line_total: l.line_total ?? null,
        pack_quantity: l.pack_quantity ?? null,
        pack_unit: l.pack_unit || null,
      })),
    });
    return NextResponse.json(
      {
        status: result.status,
        matching_error: result.matchingError,
        line_items: result.lineItems,
        prices: result.prices,
      },
      { status: 201 },
    );
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Saving line items failed" }, { status: 400 });
  }
}
