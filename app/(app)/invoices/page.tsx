import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { InvoiceStatusBadge } from "@/components/invoices/InvoiceStatusBadge";

export default async function InvoicesPage() {
  const supabase = await createClient();
  const { data: invoices } = await supabase
    .from("invoices")
    .select("id, status, invoice_number, invoice_date, total_amount, created_at, vendors(name)")
    .order("created_at", { ascending: false });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-900">Invoices</h1>
        <Link
          href="/invoices/scan"
          className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white"
        >
          Scan invoice
        </Link>
      </div>

      {!invoices?.length && (
        <p className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-center text-sm text-zinc-500">
          No invoices yet — scan your first delivery.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {invoices?.map((inv) => (
          <li key={inv.id}>
            <Link
              href={`/invoices/${inv.id}`}
              className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-4 py-3 hover:border-zinc-300"
            >
              <div>
                <p className="font-medium text-zinc-900">{inv.vendors?.name ?? "Unknown vendor"}</p>
                <p className="text-xs text-zinc-500">
                  {inv.invoice_date ?? "No date yet"}
                  {inv.invoice_number ? ` · ${inv.invoice_number}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {inv.total_amount != null && (
                  <span className="text-sm text-zinc-600">${Number(inv.total_amount).toFixed(2)}</span>
                )}
                <InvoiceStatusBadge status={inv.status} />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
