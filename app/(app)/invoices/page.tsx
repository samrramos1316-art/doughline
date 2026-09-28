import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { UNRESOLVED_STATUSES } from "@/lib/matching/review";
import { isoDaysAgo } from "@/lib/dates/localDate";
import { InvoiceStatusBadge } from "@/components/invoices/InvoiceStatusBadge";
import { Panel, Kpi, PageHeader, ButtonLink, Empty, money, th, thNum, td, tdNum, row } from "@/components/ui/dash";

const TABS = [
  { key: "all", label: "All", match: () => true },
  { key: "review", label: "Needs review", match: (s: string) => s === "needs_review" },
  { key: "failed", label: "Couldn't read", match: (s: string) => s === "failed" },
  { key: "done", label: "Done", match: (s: string) => s === "completed" },
] as const;

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = "all" } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase
    .from("invoices")
    .select("id, status, invoice_number, invoice_date, total_amount, created_at, source_type, vendors(name), invoice_line_items(match_status, parsed_line_total)")
    .order("invoice_date", { ascending: false, nullsFirst: true })
    .order("created_at", { ascending: false });
  const invoices = data ?? [];
  const current = TABS.find((t) => t.key === tab) ?? TABS[0];
  const shown = invoices.filter((i) => current.match(i.status));
  const totalOf = (i: (typeof invoices)[number]) =>
    i.total_amount != null ? Number(i.total_amount) : i.invoice_line_items.some((l) => l.parsed_line_total != null) ? i.invoice_line_items.reduce((s, l) => s + Number(l.parsed_line_total ?? 0), 0) : null;
  const since30 = isoDaysAgo(30);
  const recent = invoices.filter((i) => (i.invoice_date ?? i.created_at.slice(0, 10)) >= since30 && i.status !== "failed");
  const vendors = new Set(invoices.map((i) => i.vendors?.name).filter(Boolean)).size;

  return (
    <>
      <PageHeader
        title="Invoices"
        subtitle="Every delivery, read line by line — prices flow into your costs as you confirm them"
        tabs={TABS.map((t) => ({ href: t.key === "all" ? "/invoices" : `/invoices?tab=${t.key}`, label: t.label, active: t.key === current.key, count: invoices.filter((i) => t.match(i.status)).length }))}
        actions={
          <>
            <ButtonLink href="/invoices/import">Import files</ButtonLink>
            <ButtonLink href="/invoices/scan" primary>Scan invoice</ButtonLink>
          </>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Spend, 30 days" value={money(recent.reduce((s, i) => s + (totalOf(i) ?? 0), 0), 0)} sub={`${recent.length} invoice${recent.length === 1 ? "" : "s"}`} />
        <Kpi label="Suppliers" value={vendors} />
        <Kpi label="Needs review" value={invoices.filter((i) => i.status === "needs_review").length} tone={invoices.some((i) => i.status === "needs_review") ? "warning" : "good"} href="/review" />
        <Kpi label="Couldn't read" value={invoices.filter((i) => i.status === "failed").length} tone={invoices.some((i) => i.status === "failed") ? "critical" : "good"} href="/invoices?tab=failed" />
      </div>
      <Panel title={`${current.label} · ${shown.length}`} flush>
        {shown.length === 0 ? (
          <Empty>{invoices.length ? "Nothing here." : "No invoices yet — scan your first delivery, or import PDFs you've been emailed."}</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className={th}>Date</th>
                  <th className={th}>Supplier</th>
                  <th className={th}>Invoice #</th>
                  <th className={thNum}>Lines</th>
                  <th className={thNum}>To check</th>
                  <th className={thNum}>Total</th>
                  <th className={th}>How</th>
                  <th className={th}>Status</th>
                  <th className={th} />
                </tr>
              </thead>
              <tbody>
                {shown.map((inv) => {
                  const open = inv.invoice_line_items.filter((l) => (UNRESOLVED_STATUSES as readonly string[]).includes(l.match_status)).length;
                  return (
                    <tr key={inv.id} className={row}>
                      <td className={`${td} tabular-nums`}>{inv.invoice_date ?? "—"}</td>
                      <td className={td}>
                        <Link href={`/invoices/${inv.id}`} className="font-medium text-stone-900 hover:underline">
                          {inv.vendors?.name ?? "Unknown vendor"}
                        </Link>
                      </td>
                      <td className={`${td} text-stone-500`}>{inv.invoice_number ?? "—"}</td>
                      <td className={tdNum}>{inv.invoice_line_items.length}</td>
                      <td className={tdNum}>{open ? <span className="font-semibold text-amber-700">{open}</span> : "—"}</td>
                      <td className={tdNum}>{money(totalOf(inv))}</td>
                      <td className={`${td} text-stone-500`}>{inv.source_type === "bulk_upload" ? "Imported" : "Scanned"}</td>
                      <td className={td}><InvoiceStatusBadge status={inv.status} /></td>
                      <td className={`${td} text-right`}>
                        {inv.status === "failed" ? (
                          <Link href={`/invoices/${inv.id}/manual-entry`} className="text-xs font-medium text-amber-700 hover:underline">Enter by hand →</Link>
                        ) : open ? (
                          <Link href={`/invoices/${inv.id}/review`} className="text-xs font-medium text-amber-700 hover:underline">Review →</Link>
                        ) : (
                          <Link href={`/invoices/${inv.id}`} className="text-xs text-stone-500 hover:underline">Open →</Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
