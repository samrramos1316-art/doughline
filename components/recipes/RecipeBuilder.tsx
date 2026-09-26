"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type IngredientOption = { id: string; name: string; base_unit: string };
type Row = { ingredient_id: string; quantity: string; unit: string };

export function RecipeBuilder({
  recipeId,
  ingredientOptions,
  initialRows,
}: {
  recipeId: string;
  ingredientOptions: IngredientOption[];
  initialRows: Row[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function addRow() {
    const first = ingredientOptions[0];
    setRows((r) => [...r, { ingredient_id: first?.id ?? "", quantity: "", unit: first?.base_unit ?? "" }]);
  }

  function updateRow(index: number, patch: Partial<Row>) {
    setRows((r) => r.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function removeRow(index: number) {
    setRows((r) => r.filter((_, i) => i !== index));
  }

  async function save() {
    setPending(true);
    setError(null);

    const payload = {
      ingredients: rows
        .filter((r) => r.ingredient_id && r.quantity)
        .map((r) => ({ ingredient_id: r.ingredient_id, quantity: Number(r.quantity), unit: r.unit })),
    };

    const res = await fetch(`/api/recipes/${recipeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setPending(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Something went wrong");
      return;
    }
    router.refresh();
  }

  if (ingredientOptions.length === 0) {
    return (
      <p className="rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-500">
        Add at least one ingredient on the Ingredients page before building this recipe.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4">
      {error && <p className="text-sm text-red-600">{error}</p>}

      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-2">
          <select
            value={row.ingredient_id}
            onChange={(e) => updateRow(i, { ingredient_id: e.target.value })}
            className="rounded-md border border-zinc-300 px-2 py-1 text-sm"
          >
            {ingredientOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.name}
              </option>
            ))}
          </select>
          <input
            type="number"
            step="0.0001"
            value={row.quantity}
            onChange={(e) => updateRow(i, { quantity: e.target.value })}
            placeholder="qty"
            className="w-24 rounded-md border border-zinc-300 px-2 py-1 text-sm"
          />
          <input
            value={row.unit}
            onChange={(e) => updateRow(i, { unit: e.target.value })}
            placeholder="unit"
            className="w-20 rounded-md border border-zinc-300 px-2 py-1 text-sm"
          />
          <button type="button" onClick={() => removeRow(i)} className="text-sm text-red-600">
            Remove
          </button>
        </div>
      ))}

      <div className="flex gap-2">
        <button type="button" onClick={addRow} className="text-sm font-medium text-zinc-700 underline">
          + Add ingredient
        </button>
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="ml-auto rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save recipe"}
        </button>
      </div>
    </div>
  );
}
