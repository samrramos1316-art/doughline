import type { AlertSuggestions } from "@/lib/suggestions/engine";
import { NarrativePanel } from "./NarrativePanel";

function money(n: number) {
  return `$${n.toFixed(2)}`;
}

// §8 deterministic options, one block per affected menu item, then the
// optional Claude narrative weighing them.
export function SuggestionsPanel({ suggestions }: { suggestions: AlertSuggestions }) {
  const { alert, items, target_margin_pct } = suggestions;
  const ingredient = alert.ingredient_name.toLowerCase();

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <p className="mb-3 text-sm font-medium text-zinc-700">Suggestions</p>
        <ul className="flex flex-col gap-3">
          {items.map((i) => (
            <li key={i.menu_item_id} data-testid="suggestion" className="rounded-lg bg-zinc-50 p-3 text-sm text-zinc-800">
              <p className="font-medium text-zinc-900">{i.menu_item_name}</p>
              <p className="text-xs text-zinc-500">
                {i.previous_margin_pct}% &rarr; {i.new_margin_pct}% margin ·{" "}
                {i.target_check.meets_target
                  ? `still above your ${target_margin_pct}% target`
                  : `below your ${target_margin_pct}% target`}
              </p>
              {!i.goal ? (
                <p className="mt-2 text-zinc-600">Margin didn&apos;t drop — nothing to do.</p>
              ) : (
                <ul className="mt-2 flex flex-col gap-1.5">
                  {i.raise_price && (
                    <li>
                      Raise it from {money(i.selling_price)} to <strong>{money(i.raise_price.new_price)}</strong> (+
                      {money(i.raise_price.increase)}) to{" "}
                      {i.goal.kind === "target"
                        ? `get back to your ${i.goal.margin_pct}% target`
                        : `keep its ${i.goal.margin_pct}% margin`}
                      .
                    </li>
                  )}
                  {i.reduce_portion &&
                    (i.reduce_portion.feasible ? (
                      <li>
                        Or use <strong>{i.reduce_portion.reduce_by_display} less {ingredient}</strong> per batch (
                        {i.reduce_portion.reduce_pct}% of the recipe&apos;s {i.ingredient_qty_per_batch} {alert.base_unit}) at
                        the same price.
                      </li>
                    ) : (
                      <li className="text-zinc-500">
                        Cutting {ingredient} alone can&apos;t get there — {i.reduce_portion.reason}.
                      </li>
                    ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </div>

      <NarrativePanel alertId={alert.id} initialNarrative={alert.ai_narrative} />
    </div>
  );
}
