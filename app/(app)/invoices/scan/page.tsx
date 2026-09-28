import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";
import { ScanInvoiceClient } from "@/components/invoices/ScanInvoiceClient";

export default async function ScanInvoicePage() {
  const supabase = await createClient();
  const orgId = await getCurrentOrgId(supabase);
  if (!orgId) redirect("/login");

  return (
    <div className="flex flex-1 items-start justify-center">
      <div className="w-full max-w-md rounded-lg border border-stone-200 bg-white px-4 shadow-[0_1px_2px_rgba(28,25,23,0.04)]">
        <ScanInvoiceClient orgId={orgId} />
      </div>
    </div>
  );
}
