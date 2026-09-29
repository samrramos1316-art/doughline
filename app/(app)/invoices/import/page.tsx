import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";
import { BulkImportClient } from "@/components/invoices/BulkImportClient";
import { PageHeader, Panel } from "@/components/ui/dash";

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
    <>
      <PageHeader
        title="Import invoices"
        subtitle={<><Link href="/invoices" className="underline">Invoices</Link> · emailed PDFs, scans or photos, up to 25 at a time</>}
      />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="xl:col-span-8">
          <BulkImportClient orgId={orgId} waiting={waiting ?? []} />
        </div>
        <Panel title="Good to know" className="xl:col-span-4">
          <ul className="space-y-2 text-[13px] text-stone-600">
            <li>Each file is read and matched to your ingredients exactly like a scan.</li>
            <li><b className="text-stone-800">Older invoices</b> go into price history without changing today&apos;s costs or raising alerts.</li>
            <li>Anything unreadable is flagged so you can type it in by hand.</li>
            <li><b className="text-stone-800">Menus and recipes</b> have their own import: <Link href="/onboarding/import?kind=menu" className="font-medium text-amber-700 underline">Import your menu</Link> and <Link href="/onboarding/import?kind=recipe" className="font-medium text-amber-700 underline">Import recipes</Link>. Drop one here by mistake and it&apos;s spotted and handed over — nothing is saved as an invoice.</li>
            <li>For today&apos;s delivery on your phone, use <Link href="/invoices/scan" className="font-medium text-amber-700 underline">Scan</Link>.</li>
          </ul>
        </Panel>
      </div>
    </>
  );
}
