import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { STATUS_COLORS, type StatusKey } from "@/lib/visual/statusColors";

// Unit costs below $1 (an egg, an ounce) need the extra places to show a move.
function unitMoney(n: number | string) {
  return `$${Number(n).toFixed(Number(n) < 1 ? 4 : 2)}`;
}

// Price-alert severity uses the same status language as margin health
// (§10), but only the warning/critical/neutral tiers — a price going up is
// never "good" the way an on-target margin is. A price drop is shown
// neutral: it's worth knowing, not worth alarming about.
function severityFor(pctChange: number, acknowledged: boolean): StatusKey {
  if (acknowledged || pctChange < 0) return "neutral";
  return pctChange >= 20 ? "critical" : "warning";
}

export default async function AlertsPage() {
  const supabase = await createClient();
  const { data: alerts, error } = await supabase
    .from("price_alerts")
    .select(
      "id, previous_unit_cost, new_unit_cost, pct_change, acknowledged, created_at, ingredients(name, base_unit), menu_item_margin_impacts(id, menu_items(name))",
    )
    .order("created_at", { ascending: false });
  if (error) throw new Error("loading price alerts failed: " + error.message);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-zinc-900">Price Alerts</h1>

      {alerts.length === 0 && (
        <p className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-sm text-zinc-500">
          No price alerts yet. When a confirmed invoice price moves more than your alert threshold, it shows up
          here with the menu items it affects.
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {alerts.map((alert) => {
          const pct = Number(alert.pct_change);
          const severity = severityFor(pct, alert.acknowledged);
          const { color, bg } = STATUS_COLORS[severity];
          const impacts = alert.menu_item_margin_impacts;
          const unit = alert.ingredients?.base_unit ? `/${alert.ingredients.base_unit}` : "";

          return (
            <li key={alert.id}>
              <Link
                href={`/alerts/${alert.id}`}
                className="block rounded-xl border p-4"
                style={{ borderColor: bg, backgroundColor: bg }}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-zinc-900">
                    {alert.ingredients?.name ?? "Ingredient"} {unitMoney(alert.previous_unit_cost)}
                    {unit} &rarr; {unitMoney(alert.new_unit_cost)}
                    {unit}
                  </p>
                  <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold" style={{ color }}>
                    {pct > 0 ? "+" : ""}
                    {pct.toFixed(1)}%
                  </span>
                </div>
                <p className="mt-1 text-sm text-zinc-600">
                  {impacts.length === 0
                    ? "No active menu items use it"
                    : `Affects ${impacts.length} menu item${impacts.length === 1 ? "" : "s"}: ${impacts
                        .map((mi) => mi.menu_items?.name)
                        .join(", ")}`}
                </p>
                {alert.acknowledged && <p className="mt-1 text-xs text-zinc-400">Acknowledged</p>}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
