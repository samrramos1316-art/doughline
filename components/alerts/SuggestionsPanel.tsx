import type { MockSuggestion } from "@/lib/mock/alerts";

export function SuggestionsPanel({
  suggestions,
  aiNarrative,
}: {
  suggestions: MockSuggestion[];
  aiNarrative: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      {suggestions.length > 0 && (
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <p className="mb-3 text-sm font-medium text-zinc-700">Suggestions</p>
          <ul className="flex flex-col gap-2">
            {suggestions.map((s, i) => (
              <li key={i} className="rounded-lg bg-zinc-50 p-3 text-sm text-zinc-800">
                {s.type === "raise_price" ? (
                  <>
                    Raise <strong>{s.menu_item_name}</strong> from ${s.current_price.toFixed(2)} to{" "}
                    <strong>${s.new_price.toFixed(2)}</strong> to restore your target margin.
                  </>
                ) : (
                  <>
                    Or reduce the {s.ingredient_name} portion in <strong>{s.menu_item_name}</strong> by{" "}
                    <strong>
                      {s.reduce_by}
                      {s.unit}
                    </strong>{" "}
                    to hit the same target without changing the price.
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
        <p className="mb-2 text-xs font-semibold tracking-wide text-blue-700 uppercase">
          AI-generated suggestion
        </p>
        <p className="text-sm leading-relaxed text-blue-950">{aiNarrative}</p>
      </div>
    </div>
  );
}
