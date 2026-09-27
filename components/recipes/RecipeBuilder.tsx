"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  EditableGrid,
  blankRow,
  gridErrors,
  isBlankRow,
  parseNumber,
  type GridColumn,
  type GridRow,
} from "@/components/grid/EditableGrid";

type IngredientOption = { id: string; name: string; base_unit: string };
type Row = { ingredient_id: string; quantity: string; unit: string };

// §9.2: a recipe's ingredient list as grid rows. Paste "Unsalted Butter<TAB>1.25"
// lines straight from a spreadsheet; names resolve to your ingredients. The
// unit is always the ingredient's base unit, because recipe costing
// (recipe_costs view) multiplies quantity by cost-per-base-unit.
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
  const unitOf = useMemo(() => new Map(ingredientOptions.map((o) => [o.id, o.base_unit])), [ingredientOptions]);

  const columns: GridColumn[] = useMemo(
    () => [
      {
        key: "ingredient_id",
        label: "Ingredient",
        type: "select",
        required: true,
        minWidth: 260,
        options: ingredientOptions.map((o) => ({ value: o.id, label: o.name })),
      },
      {
        key: "quantity",
        label: "Quantity",
        type: "number",
        align: "right",
        required: true,
        minWidth: 110,
        validate: (v) => (parseNumber(v) === 0 ? "Quantity must be more than 0" : null),
      },
      { key: "unit", label: "Unit", minWidth: 80, readOnly: () => true },
    ],
    [ingredientOptions],
  );

  const [rows, setRows] = useState<GridRow[]>(() => [
    ...initialRows.map((r, i) => ({ key: `existing-${i}`, values: { ...r } })),
    blankRow(columns),
  ]);
  const [showAllErrors, setShowAllErrors] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Keep each row's unit in step with its ingredient.
  function handleChange(next: GridRow[]) {
    setRows(
      next.map((r) => {
        const unit = unitOf.get(r.values.ingredient_id) ?? "";
        return r.values.unit === unit ? r : { ...r, values: { ...r.values, unit } };
      }),
    );
  }

  async function save() {
    setShowAllErrors(true);
    setError(null);
    const errors = gridErrors(columns, rows);
    if (errors.size) {
      setError(`Fix the ${errors.size} highlighted row${errors.size === 1 ? "" : "s"} first — nothing was saved.`);
      return;
    }
    setPending(true);
    const payload = {
      ingredients: rows
        .filter((r) => !isBlankRow(columns, r))
        .map((r) => ({
          ingredient_id: r.values.ingredient_id,
          quantity: parseNumber(r.values.quantity),
          unit: unitOf.get(r.values.ingredient_id),
        })),
    };
    const res = await fetch(`/api/recipes/${recipeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setPending(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
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
    <div className="flex flex-col gap-3">
      <EditableGrid
        label="Recipe ingredients"
        columns={columns}
        rows={rows}
        onChange={handleChange}
        showAllErrors={showAllErrors}
        canDeleteRow={() => true}
        onDeleteRow={(r) => setRows(rows.filter((x) => x.key !== r.key))}
      />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save recipe"}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}
