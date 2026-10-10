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

type IngredientOption = { id: string; name: string; base_unit: string; waste_pct?: number };
type Row = { ingredient_id: string; quantity: string; unit: string; waste_pct: string };
export type LaborOverheadValues = { labor_minutes: number; labor_rate_per_hour: number | null; overhead_pct: number };

const input = "w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm outline-none focus:border-stone-500 focus:ring-2 focus:ring-amber-200";
const blankIfZero = (n: number | null | undefined) => (n == null || n === 0 ? "" : String(n));

// §9.2: a recipe's ingredient list as grid rows. Paste "Unsalted Butter<TAB>1.25"
// lines straight from a spreadsheet; names resolve to your ingredients. The
// unit is always the ingredient's base unit, because recipe costing
// (recipe_costs view) multiplies quantity by cost-per-base-unit.
//
// Waste % and labor & overhead (migration 025) stay out of the way until
// they're used: the waste column appears once any line or material has
// waste or the owner asks for it, and labor sits in a closed section. A
// blank waste cell follows the material's waste % (migration 027), shown as
// the placeholder; a number overrides it for this line.
export function RecipeBuilder({
  recipeId,
  ingredientOptions,
  initialRows,
  initialLabor,
  defaultLaborRate,
  labels = { ingredient: "Ingredient", ingredients: "Ingredients", recipe: "recipe" },
  defaultWastePct = 0,
  showLaborByDefault = false,
  machine,
}: {
  recipeId: string;
  ingredientOptions: IngredientOption[];
  initialRows: Row[];
  initialLabor: LaborOverheadValues;
  defaultLaborRate: number;
  labels?: { ingredient: string; ingredients: string; recipe: string };
  // From the industry profile (lib/industries): with a default waste % the
  // waste column starts visible, and the labor section starts open. 0 /
  // false for food.
  defaultWastePct?: number;
  showLaborByDefault?: boolean;
  // Machine time (migration 029): given for industries that cost it (or a
  // recipe that already has some); left out, no machine fields and nothing
  // about machine time is sent.
  machine?: { minutes: number; ratePerHour: number | null; defaultRate: number };
}) {
  const router = useRouter();
  const unitOf = useMemo(() => new Map(ingredientOptions.map((o) => [o.id, o.base_unit])), [ingredientOptions]);
  const wasteOf = useMemo(() => new Map(ingredientOptions.map((o) => [o.id, Number(o.waste_pct ?? 0)])), [ingredientOptions]);
  const [showWaste, setShowWaste] = useState(
    () => defaultWastePct > 0 || initialRows.some((r) => r.waste_pct.trim() !== "" || (wasteOf.get(r.ingredient_id) ?? 0) > 0),
  );
  const hasLabor = showLaborByDefault || initialLabor.labor_minutes > 0 || initialLabor.overhead_pct > 0 || initialLabor.labor_rate_per_hour != null || (machine?.minutes ?? 0) > 0;
  const [labor, setLabor] = useState({
    labor_minutes: blankIfZero(initialLabor.labor_minutes),
    labor_rate_per_hour: initialLabor.labor_rate_per_hour == null ? "" : String(initialLabor.labor_rate_per_hour),
    overhead_pct: blankIfZero(initialLabor.overhead_pct),
    machine_minutes: blankIfZero(machine?.minutes ?? 0),
    machine_rate_per_hour: machine?.ratePerHour == null ? "" : String(machine.ratePerHour),
  });

  const columns: GridColumn[] = useMemo(
    () => [
      {
        key: "ingredient_id",
        label: labels.ingredient,
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
      ...(showWaste
        ? [
            {
              key: "waste_pct",
              label: "Waste %",
              type: "number",
              align: "right",
              minWidth: 90,
              rowPlaceholder: (r: GridRow) => (r.values.ingredient_id ? String(wasteOf.get(r.values.ingredient_id) ?? 0) : undefined),
              validate: (v: string) => ((parseNumber(v) ?? 0) >= 100 ? "Waste must be under 100%" : null),
            } satisfies GridColumn,
          ]
        : []),
    ],
    [ingredientOptions, showWaste, labels.ingredient, wasteOf],
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

  function laborError(): string | null {
    const minutes = parseNumber(labor.labor_minutes);
    const rate = parseNumber(labor.labor_rate_per_hour);
    const overhead = parseNumber(labor.overhead_pct);
    if (minutes != null && !(minutes >= 0)) return "Labor minutes must be a number, 0 or more.";
    if (rate != null && !(rate >= 0)) return "Hourly rate must be a number, 0 or more.";
    if (overhead != null && !(overhead >= 0 && overhead < 1000)) return "Overhead must be a percentage, 0 or more.";
    const mMinutes = parseNumber(labor.machine_minutes);
    const mRate = parseNumber(labor.machine_rate_per_hour);
    if (mMinutes != null && !(mMinutes >= 0)) return "Machine minutes must be a number, 0 or more.";
    if (mRate != null && !(mRate >= 0)) return "Machine rate must be a number, 0 or more.";
    return null;
  }

  async function save() {
    setShowAllErrors(true);
    setError(null);
    const errors = gridErrors(columns, rows);
    if (errors.size) {
      setError(`Fix the ${errors.size} highlighted row${errors.size === 1 ? "" : "s"} first — nothing was saved.`);
      return;
    }
    const le = laborError();
    if (le) {
      setError(le);
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
          waste_pct: parseNumber(r.values.waste_pct ?? ""), // blank = the material's waste %
        })),
      labor_minutes: parseNumber(labor.labor_minutes) ?? 0,
      labor_rate_per_hour: parseNumber(labor.labor_rate_per_hour), // blank = the business's default rate
      overhead_pct: parseNumber(labor.overhead_pct) ?? 0,
      ...(machine
        ? {
            machine_minutes: parseNumber(labor.machine_minutes) ?? 0,
            machine_rate_per_hour: parseNumber(labor.machine_rate_per_hour), // blank = the business's default machine rate
          }
        : {}),
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
        Add at least one {labels.ingredient.toLowerCase()} on the {labels.ingredients} page before building this {labels.recipe}.
      </p>
    );
  }

  const field = (key: keyof typeof labor, label: string, hint: string, placeholder = "0") => (
    <label className="block text-sm">
      <span className="font-medium text-stone-800">{label}</span>
      <input
        type="number"
        min="0"
        step="any"
        inputMode="decimal"
        value={labor[key]}
        placeholder={placeholder}
        onChange={(e) => setLabor({ ...labor, [key]: e.target.value })}
        className={`${input} mt-1`}
      />
      <span className="mt-1 block text-xs text-stone-500">{hint}</span>
    </label>
  );

  return (
    <div className="flex flex-col gap-3">
      <EditableGrid
        label={`${labels.recipe[0].toUpperCase()}${labels.recipe.slice(1)} ${labels.ingredients.toLowerCase()}`}
        columns={columns}
        rows={rows}
        onChange={handleChange}
        showAllErrors={showAllErrors}
        canDeleteRow={() => true}
        onDeleteRow={(r) => setRows(rows.filter((x) => x.key !== r.key))}
      />
      {showWaste && (
        <p className="-mt-1 text-xs text-stone-500">
          A blank Waste % uses the {labels.ingredient.toLowerCase()}&apos;s own waste % (set on the {labels.ingredients} page); type a number to override it for this line.
        </p>
      )}
      {!showWaste && (
        <button type="button" onClick={() => setShowWaste(true)} className="self-start text-xs font-medium text-amber-700 hover:underline">
          + Track waste % (trim, scrap, breakage)
        </button>
      )}
      <details open={hasLabor} className="rounded-lg border border-stone-200 bg-stone-50/60">
        <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-stone-800">Labor{machine ? ", machine time" : ""} &amp; overhead <span className="font-normal text-stone-500">(optional)</span></summary>
        <div className="grid gap-3 border-t border-stone-200 p-3 sm:grid-cols-3">
          {field("labor_minutes", "Labor minutes per batch", "Hands-on time to make one batch.")}
          {field(
            "labor_rate_per_hour",
            "Hourly rate ($)",
            defaultLaborRate > 0 ? `Blank uses your default, $${defaultLaborRate.toFixed(2)}/h (Settings).` : "Blank uses your default rate from Settings.",
            defaultLaborRate > 0 ? defaultLaborRate.toFixed(2) : "",
          )}
          {field("overhead_pct", "Overhead %", machine ? "Added on top of materials, labor and machine time (rent, power, consumables)." : "Added on top of materials and labor (rent, power, packaging).")}
          {machine && field("machine_minutes", "Machine minutes per batch", "Run time on the laser, brake, saw or CNC.")}
          {machine &&
            field(
              "machine_rate_per_hour",
              "Machine rate ($/h)",
              machine.defaultRate > 0 ? `Blank uses your default, $${machine.defaultRate.toFixed(2)}/h (Settings).` : "What an hour of this machine costs you. Blank uses your default from Settings.",
              machine.defaultRate > 0 ? machine.defaultRate.toFixed(2) : "",
            )}
        </div>
      </details>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? "Saving…" : `Save ${labels.recipe}`}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}
