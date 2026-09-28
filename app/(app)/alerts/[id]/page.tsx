import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAlertSuggestions } from "@/lib/suggestions/engine";
import { SuggestionsPanel } from "@/components/alerts/SuggestionsPanel";
import { AcknowledgeButton } from "@/components/alerts/AcknowledgeButton";
import { Panel, Kpi, PageHeader, Delta, Empty, money, unitMoney, th, thNum, td, tdNum, row } from "@/components/ui/dash";

const pctText = (n: number | string | null) => (n == null ? "—" : `${Number(n).toFixed(1)}%`);

// §6.1 step 4: the concrete "X went from $a to $b; here's what it did to
// each menu item" view, read from the menu_item_margin_impacts rows written
// at the moment the price changed (§6.2) — not recomputed from today's costs.
export default async function AlertDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: alert } = await supabase
    .from("price_alerts")
    .select(
      "id, previous_unit_cost, new_unit_cost, pct_change, acknowledged, created_at, invoice_id, ingredients(name, base_unit), invoices(invoice_number, invoice_date, vendors(name)), menu_item_margin_impacts(id, previous_margin_pct, new_margin_pct, margin_pct_delta, previous_margin_amount, new_margin_amount, menu_items(name, selling_price), recipes(name))",
    )
    .eq("id", id)
    .maybeSingle();
  if (!alert) notFound();
  const suggestions = await getAlertSuggestions(supabase, id);

  const pct = Number(alert.pct_change);
  const unit = alert.ingredients?.base_unit ? `/${alert.ingredients.base_unit}` : "";
  const impacts = [...alert.menu_item_margin_impacts].sort((a, b) => Number(a.margin_pct_delta) - Number(b.margin_pct_delta));
  const lostPerRound = impacts.reduce((s, i) => s + (Number(i.previous_margin_amount) - Number(i.new_margin_amount)), 0);

  return (
    <>
      <PageHeader
        title={`${alert.ingredients?.name ?? "Ingredient"} price change`}
        subtitle={
          <>
            <Link href="/alerts" className="underline">Price alerts</Link>
            {alert.invoices && alert.invoice_id && (
              <>
                {" · from "}
                <Link href={`/invoices/${alert.invoice_id}`} className="underline">
                  {alert.invoices.vendors?.name ?? "invoice"}
                  {alert.invoices.invoice_number ? ` ${alert.invoices.invoice_number}` : ""}
                </Link>
                {alert.invoices.invoice_date ? ` · ${alert.invoices.invoice_date}` : ""}
              </>
            )}
          </>
        }
        actions={<AcknowledgeButton alertId={alert.id} acknowledged={alert.acknowledged} />}
      />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Price change" value={<Delta value={pct} />} tone={pct >= 20 ? "critical" : pct > 0 ? "warning" : "good"} sub={`${unitMoney(Number(alert.previous_unit_cost))}${unit} → ${unitMoney(Number(alert.new_unit_cost))}${unit}`} />
        <Kpi label="Menu items hit" value={impacts.length} tone={impacts.length ? "warning" : "neutral"} />
        <Kpi label="Worst margin hit" value={impacts[0] ? <Delta value={Number(impacts[0].margin_pct_delta)} suffix="pp" goodWhenUp dp={2} /> : "—"} sub={impacts[0]?.menu_items?.name ?? "—"} />
        <Kpi label="Profit lost" value={money(lostPerRound)} sub="selling one of each affected item" tone={lostPerRound > 0 ? "warning" : "neutral"} />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Panel title="Menu items affected" flush className="xl:col-span-7">
          {impacts.length === 0 ? (
            <Empty>No active menu items use this ingredient.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className={th}>Menu item</th>
                    <th className={thNum}>Sells</th>
                    <th className={thNum}>Before</th>
                    <th className={thNum}>After</th>
                    <th className={thNum}>Change</th>
                  </tr>
                </thead>
                <tbody>
                  {impacts.map((mi) => (
                    <tr key={mi.id} className={row}>
                      <td className={td}>
                        <span className="font-medium text-stone-900">{mi.menu_items?.name}</span>
                        <span className="block text-[11px] text-stone-500">{mi.recipes?.name}</span>
                      </td>
                      <td className={tdNum}>{money(mi.menu_items?.selling_price == null ? null : Number(mi.menu_items.selling_price))}</td>
                      <td className={tdNum}>
                        {pctText(mi.previous_margin_pct)}
                        <span className="block text-[11px] text-stone-500">{money(Number(mi.previous_margin_amount))}</span>
                      </td>
                      <td className={tdNum}>
                        {pctText(mi.new_margin_pct)}
                        <span className="block text-[11px] text-stone-500">{money(Number(mi.new_margin_amount))}</span>
                      </td>
                      <td className={tdNum}><Delta value={Number(mi.margin_pct_delta)} suffix="pp" goodWhenUp dp={2} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
        <div className="xl:col-span-5">
          {suggestions && suggestions.items.length > 0 ? (
            <SuggestionsPanel suggestions={suggestions} />
          ) : (
            <Panel title="What to do">
              <p className="text-sm text-stone-500">Nothing to change — no menu item lost margin.</p>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
