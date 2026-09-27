import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAlertSuggestions } from "@/lib/suggestions/engine";
import { SuggestionsPanel } from "@/components/alerts/SuggestionsPanel";

function money(n: number | string | null) {
  return n == null ? "—" : `$${Number(n).toFixed(2)}`;
}

// Unit costs below $1 (an egg, an ounce) need the extra places to show a move.
function unitMoney(n: number | string) {
  return `$${Number(n).toFixed(Number(n) < 1 ? 4 : 2)}`;
}

function pctText(n: number | string | null) {
  return n == null ? "—" : `${Number(n).toFixed(1)}%`;
}

// §6.1 step 4: the concrete "X went from $a to $b; here's what it did to
// each menu item" view, read from the menu_item_margin_impacts rows written
// at the moment the price changed (§6.2) — not recomputed from today's costs.
export default async function AlertDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: alert } = await supabase
    .from("price_alerts")
    .select(
      "id, previous_unit_cost, new_unit_cost, pct_change, created_at, invoice_id, ingredients(name, base_unit), invoices(invoice_number, invoice_date, vendors(name)), menu_item_margin_impacts(id, previous_margin_pct, new_margin_pct, margin_pct_delta, previous_margin_amount, new_margin_amount, menu_items(name, selling_price), recipes(name))",
    )
    .eq("id", id)
    .maybeSingle();
  if (!alert) notFound();
  const suggestions = await getAlertSuggestions(supabase, id);

  const pct = Number(alert.pct_change);
  const unit = alert.ingredients?.base_unit ? `/${alert.ingredients.base_unit}` : "";
  const impacts = [...alert.menu_item_margin_impacts].sort(
    (a, b) => Number(a.margin_pct_delta) - Number(b.margin_pct_delta),
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">{alert.ingredients?.name ?? "Ingredient"} price change</h1>
        <p className="text-sm text-zinc-500">
          {unitMoney(alert.previous_unit_cost)}
          {unit} &rarr; {unitMoney(alert.new_unit_cost)}
          {unit} ({pct > 0 ? "+" : ""}
          {pct.toFixed(1)}%)
        </p>
        {alert.invoices && alert.invoice_id && (
          <Link href={`/invoices/${alert.invoice_id}`} className="text-sm text-zinc-500 underline">
            From {alert.invoices.vendors?.name ?? "invoice"}
            {alert.invoices.invoice_number ? ` · ${alert.invoices.invoice_number}` : ""}
            {alert.invoices.invoice_date ? ` · ${alert.invoices.invoice_date}` : ""}
          </Link>
        )}
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <p className="mb-3 text-sm font-medium text-zinc-700">Menu items affected</p>
        {impacts.length === 0 ? (
          <p className="text-sm text-zinc-500">No active menu items use this ingredient.</p>
        ) : (
          <table className="w-full text-left text-sm [&_td]:pr-3 [&_th]:pr-3">
            <thead>
              <tr className="border-b border-zinc-200 text-zinc-500">
                <th className="py-2">Menu item</th>
                <th>Before</th>
                <th>After</th>
                <th>Change</th>
              </tr>
            </thead>
            <tbody>
              {impacts.map((mi) => {
                const delta = Number(mi.margin_pct_delta);
                return (
                  <tr key={mi.id} className="border-b border-zinc-100 align-top">
                    <td className="py-2">
                      {mi.menu_items?.name}
                      <span className="block text-xs text-zinc-500">
                        {mi.recipes?.name} · sells for {money(mi.menu_items?.selling_price ?? null)}
                      </span>
                    </td>
                    <td>
                      {pctText(mi.previous_margin_pct)}
                      <span className="block text-xs text-zinc-500">{money(mi.previous_margin_amount)}</span>
                    </td>
                    <td>
                      {pctText(mi.new_margin_pct)}
                      <span className="block text-xs text-zinc-500">{money(mi.new_margin_amount)}</span>
                    </td>
                    <td className={delta < 0 ? "text-red-600" : "text-green-600"}>
                      {delta > 0 ? "+" : ""}
                      {delta.toFixed(2)}pp
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {suggestions && suggestions.items.length > 0 && <SuggestionsPanel suggestions={suggestions} />}
    </div>
  );
}
