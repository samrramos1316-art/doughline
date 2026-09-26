import Link from "next/link";
import { mockAlerts } from "@/lib/mock/alerts";
import { STATUS_COLORS, type StatusKey } from "@/lib/visual/statusColors";

// Price-alert severity uses the same status language as margin health
// (§10), but only the warning/critical/neutral tiers — a price going up is
// never "good" the way an on-target margin is.
function severityFor(pctChange: number, acknowledged: boolean): StatusKey {
  if (acknowledged) return "neutral";
  return pctChange >= 20 ? "critical" : "warning";
}

export default function AlertsPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-zinc-900">Price Alerts</h1>

      <ul className="flex flex-col gap-3">
        {mockAlerts.map((alert) => {
          const severity = severityFor(alert.pct_change, alert.acknowledged);
          const { color, bg } = STATUS_COLORS[severity];
          const impactedNames = alert.margin_impacts.map((mi) => mi.menu_item_name).join(", ");

          return (
            <li key={alert.id}>
              <Link
                href={`/alerts/${alert.id}`}
                className="block rounded-xl border p-4"
                style={{ borderColor: bg, backgroundColor: bg }}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-zinc-900">
                    {alert.ingredient_name} ${alert.previous_unit_cost.toFixed(2)} &rarr; $
                    {alert.new_unit_cost.toFixed(2)}
                  </p>
                  <span
                    className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold"
                    style={{ color }}
                  >
                    {alert.pct_change > 0 ? "+" : ""}
                    {alert.pct_change.toFixed(1)}%
                  </span>
                </div>
                <p className="mt-1 text-sm text-zinc-600">
                  Affects {alert.margin_impacts.length} menu item{alert.margin_impacts.length === 1 ? "" : "s"}:{" "}
                  {impactedNames}
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
