import { notFound } from "next/navigation";
import { getMockAlert } from "@/lib/mock/alerts";
import { SuggestionsPanel } from "@/components/alerts/SuggestionsPanel";

export default async function AlertDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const alert = getMockAlert(id);
  if (!alert) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">{alert.ingredient_name} price change</h1>
        <p className="text-sm text-zinc-500">
          ${alert.previous_unit_cost.toFixed(2)} &rarr; ${alert.new_unit_cost.toFixed(2)} (
          {alert.pct_change > 0 ? "+" : ""}
          {alert.pct_change.toFixed(1)}%)
        </p>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <p className="mb-3 text-sm font-medium text-zinc-700">Menu items affected</p>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-zinc-500">
              <th className="py-2">Menu item</th>
              <th>Before</th>
              <th>After</th>
              <th>Change</th>
            </tr>
          </thead>
          <tbody>
            {alert.margin_impacts.map((mi) => (
              <tr key={mi.id} className="border-b border-zinc-100">
                <td className="py-2">{mi.menu_item_name}</td>
                <td>{mi.previous_margin_pct}%</td>
                <td>{mi.new_margin_pct}%</td>
                <td className={mi.margin_pct_delta < 0 ? "text-red-600" : "text-green-600"}>
                  {mi.margin_pct_delta > 0 ? "+" : ""}
                  {mi.margin_pct_delta}pp
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SuggestionsPanel suggestions={alert.suggestions} aiNarrative={alert.ai_narrative} />
    </div>
  );
}
