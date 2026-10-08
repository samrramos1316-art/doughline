import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Panel, Kpi, PageHeader, Pill, Delta, Empty, unitMoney, th, thNum, td, tdNum, row } from "@/components/ui/dash";
import { getVocab } from "@/lib/supabase/vocab";
import { lower, withArticle } from "@/lib/vocab";

const TABS = [
  { key: "open", label: "Open" },
  { key: "handled", label: "Handled" },
  { key: "all", label: "All" },
] as const;

export default async function AlertsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = "open" } = await searchParams;
  const supabase = await createClient();
  const [{ data: alerts, error }, { data: org }, v] = await Promise.all([
    supabase
      .from("price_alerts")
      .select("id, previous_unit_cost, new_unit_cost, pct_change, acknowledged, created_at, ingredients(name, base_unit), invoices(invoice_number, invoice_date, vendors(name)), menu_item_margin_impacts(id, margin_pct_delta, menu_items(name))")
      .order("created_at", { ascending: false }),
    supabase.from("organizations").select("price_alert_threshold_pct").maybeSingle(),
    getVocab(),
  ]);
  if (error) throw new Error("loading price alerts failed: " + error.message);
  const all = alerts ?? [];
  const isOpen = (a: (typeof all)[number]) => !a.acknowledged && Number(a.pct_change) > 0;
  const shown = all.filter((a) => (tab === "all" ? true : tab === "handled" ? !isOpen(a) : isOpen(a)));
  const open = all.filter(isOpen);
  const worst = [...open].sort((a, b) => Number(b.pct_change) - Number(a.pct_change))[0];
  const hit = new Set(open.flatMap((a) => a.menu_item_margin_impacts.map((i) => i.menu_items?.name)));

  return (
    <>
      <PageHeader
        title="Price alerts"
        subtitle={`An alert fires when a confirmed invoice moves ${withArticle(lower(v.ingredient))} more than ${Number(org?.price_alert_threshold_pct ?? 8)}% — change that in Settings`}
        tabs={TABS.map((t) => ({ href: t.key === "open" ? "/alerts" : `/alerts?tab=${t.key}`, label: t.label, active: t.key === tab, count: t.key === "open" ? open.length : t.key === "handled" ? all.length - open.length : all.length }))}
      />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Open alerts" value={open.length} tone={open.length ? "critical" : "good"} />
        <Kpi label="Biggest rise" value={worst ? `+${Number(worst.pct_change).toFixed(1)}%` : "—"} sub={worst?.ingredients?.name ?? "nothing open"} tone={worst ? "critical" : "neutral"} />
        <Kpi label={`${v.menuItems} hit`} value={hit.size} sub={[...hit].slice(0, 3).join(", ") || "none"} tone={hit.size ? "warning" : "neutral"} />
        <Kpi label="All time" value={all.length} />
      </div>
      <Panel title={`${TABS.find((t) => t.key === tab)?.label ?? "Open"} alerts`} flush>
        {shown.length === 0 ? (
          <Empty>{all.length ? "Nothing here." : `No price alerts yet. When a confirmed invoice moves a price past your threshold, it lands here with the ${lower(v.menuItems)} it affects.`}</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className={th}>{v.ingredient}</th>
                  <th className={thNum}>Change</th>
                  <th className={thNum}>Price</th>
                  <th className={th}>{v.menuItems} hit</th>
                  <th className={thNum}>Worst hit</th>
                  <th className={th}>From</th>
                  <th className={th}>Status</th>
                  <th className={th} />
                </tr>
              </thead>
              <tbody>
                {shown.map((a) => {
                  const pct = Number(a.pct_change);
                  const worstHit = Math.min(0, ...a.menu_item_margin_impacts.map((i) => Number(i.margin_pct_delta)));
                  const u = a.ingredients?.base_unit ? `/${a.ingredients.base_unit}` : "";
                  return (
                    <tr key={a.id} className={row}>
                      <td className={td}>
                        <Link href={`/alerts/${a.id}`} className="font-medium text-stone-900 hover:underline">{a.ingredients?.name ?? v.ingredient}</Link>
                      </td>
                      <td className={tdNum}><Delta value={pct} /></td>
                      <td className={tdNum}>{unitMoney(Number(a.previous_unit_cost))} → {unitMoney(Number(a.new_unit_cost))}{u}</td>
                      <td className={`${td} max-w-64 truncate text-stone-600`}>
                        {a.menu_item_margin_impacts.length ? a.menu_item_margin_impacts.map((i) => i.menu_items?.name).join(", ") : <span className="text-stone-400">none</span>}
                      </td>
                      <td className={tdNum}>{worstHit < 0 ? <Delta value={worstHit} suffix="pp" goodWhenUp /> : "—"}</td>
                      <td className={`${td} text-stone-500`}>{a.invoices ? `${a.invoices.vendors?.name ?? "Invoice"} · ${a.invoices.invoice_date ?? ""}` : "—"}</td>
                      <td className={td}>{isOpen(a) ? <Pill tone={pct >= 20 ? "critical" : "warning"}>Open</Pill> : <Pill tone="neutral">{pct < 0 ? "Price drop" : "Handled"}</Pill>}</td>
                      <td className={`${td} text-right`}>
                        <Link href={`/alerts/${a.id}`} className="text-xs font-medium text-amber-700 hover:underline">What to do →</Link>
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
