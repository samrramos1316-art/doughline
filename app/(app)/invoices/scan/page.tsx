import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";
import { ScanInvoiceClient } from "@/components/invoices/ScanInvoiceClient";

export default async function ScanInvoicePage() {
  const supabase = await createClient();
  const orgId = await getCurrentOrgId(supabase);
  if (!orgId) redirect("/login");

  return <ScanInvoiceClient orgId={orgId} />;
}
