import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";
import { BulkImportClient } from "@/components/invoices/BulkImportClient";

export default async function ImportInvoicesPage() {
  const supabase = await createClient();
  const orgId = await getCurrentOrgId(supabase);
  if (!orgId) redirect("/login");

  // Bulk-imported invoices whose reading was interrupted (tab closed mid-queue).
  const { data: waiting } = await supabase
    .from("invoices")
    .select("id, file_type, created_at")
    .eq("source_type", "bulk_upload")
    .eq("status", "pending")
    .order("created_at");

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Import past invoices</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Backfill your price history from old invoices. Each one is read and matched like a scan, and older prices
          are saved to history without changing today&apos;s costs. For today&apos;s delivery,{" "}
          <Link href="/invoices/scan" className="underline">
            scan it
          </Link>{" "}
          instead.
        </p>
      </div>
      <BulkImportClient orgId={orgId} waiting={waiting ?? []} />
    </div>
  );
}
