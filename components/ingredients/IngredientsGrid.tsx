"use client";

import { useMemo, useRef, useState } from "react";
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
import { LOCAL_DATE_HEADER, browserLocalDate } from "@/lib/dates/localDate";
import { useVocab } from "@/components/app/VocabProvider";
import { cleanPackSizes, isContainerUnit, packSizeFor } from "@/lib/costing/units";
import { needsUnitSize } from "@/lib/costing/rebaseUnit";

export type IngredientRecord = {
  id: string;
  name: string;
  category: string | null;
  base_unit: string;
  current_unit_cost: number | null;
  waste_pct?: number | null;
  pack_sizes?: unknown; // migration 028; florists see it as Per bunch / Per box
};

type Message = { kind: "error" | "ok"; text: string; details?: string[] } | null;

const CATEGORIES = ["dairy", "dry_goods", "produce", "protein", "packaging", "beverage", "frozen"];
const BASE_UNITS = ["lb", "oz", "kg", "g", "each", "dozen", "gal", "qt", "l", "ml"];
const columnsFor = (categories: string[], units: string[]): GridColumn[] => [
  { key: "name", label: "Name", required: true, minWidth: 240 },
  { key: "category", label: "Category", suggestions: categories, minWidth: 140 },
  { key: "base_unit", label: "Base unit", required: true, suggestions: units, minWidth: 110 },
  { key: "current_unit_cost", label: "Cost / unit", type: "number", align: "right", minWidth: 110 },
];
const FOOD_COLUMNS = columnsFor(CATEGORIES, BASE_UNITS);
// Waste/loss % per material (migration 027): every recipe line using it
// follows it unless the line has its own. Blank on a new row = the
// industry's default; blank on an existing row leaves it as it was.
const wasteColumn = (defaultPct: number): GridColumn => ({
  key: "waste_pct",
  label: "Waste %",
  type: "number",
  align: "right",
  minWidth: 90,
  placeholder: String(defaultPct),
  validate: (v) => {
    const n = parseNumber(v);
    return n != null && !(n >= 0 && n < 100) ? "Waste must be 0 to under 100%" : null;
  },
});

// How many of the base unit come in a bunch / a box (migration 028), for
// prices on invoices that don't print the pack size. 0 clears it.
const packColumn = (unit: "bunch" | "box"): GridColumn => ({
  key: `per_${unit}`,
  label: `Per ${unit}`,
  type: "number",
  align: "right",
  minWidth: 90,
  placeholder: "—",
  validate: (v) => {
    const n = parseNumber(v);
    return n != null && !(n >= 0) ? `How many to a ${unit}` : null;
  },
});
const packOf = (i: IngredientRecord, unit: "bunch" | "box") => {
  const n = Number((i.pack_sizes as Record<string, unknown> | null | undefined)?.[unit]);
  return Number.isFinite(n) && n > 0 ? String(n) : "";
};

const valuesOf = (i: IngredientRecord) => ({
  name: i.name,
  category: i.category ?? "",
  base_unit: i.base_unit,
  current_unit_cost: i.current_unit_cost == null ? "" : String(i.current_unit_cost),
  waste_pct: String(Number(i.waste_pct ?? 0)),
  per_bunch: packOf(i, "bunch"),
  per_box: packOf(i, "box"),
});

// §9.2: the ingredient master list as a spreadsheet — edit cells in place,
// paste rows from a sheet, then save once. Saves go through the same bulk
// upsert as CSV import (one embedding call for everything new or renamed).
// A remount after save (keyed on the stored list) restarts from the database.
// `suggest`: the industry's units and categories (lib/industries); left out,
// the food lists above. `waste`: show the Waste % column, with this default
// for new rows; left out (food, until a material has waste), no column.
export type Suggestions = { units: string[]; categories: string[] };
export function IngredientsGrid({ ingredients, suggest, waste, packs = false }: { ingredients: IngredientRecord[]; suggest?: Suggestions; waste?: { defaultPct: number }; packs?: boolean }) {
  const [message, setMessage] = useState<Message>(null);
  const version = ingredients.map((i) => `${i.id}:${i.name}:${i.current_unit_cost}:${i.base_unit}:${i.category}:${i.waste_pct}:${JSON.stringify(i.pack_sizes ?? {})}`).join("|");
  return <IngredientsGridForm key={version} ingredients={ingredients} message={message} setMessage={setMessage} suggest={suggest} waste={waste} packs={packs} />;
}

function IngredientsGridForm({
  ingredients,
  message,
  setMessage,
  suggest,
  waste,
  packs,
}: {
  ingredients: IngredientRecord[];
  message: Message;
  setMessage: (m: Message) => void;
  suggest?: Suggestions;
  waste?: { defaultPct: number };
  packs: boolean;
}) {
  const v = useVocab();
  const wasteDefault = waste?.defaultPct;
  const COLUMNS = useMemo(() => {
    const base = suggest ? columnsFor(suggest.categories, suggest.units) : FOOD_COLUMNS;
    return [...base, ...(wasteDefault == null ? [] : [wasteColumn(wasteDefault)]), ...(packs ? [packColumn("bunch"), packColumn("box")] : [])];
  }, [suggest, wasteDefault, packs]);
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const byId = useMemo(() => new Map(ingredients.map((i) => [i.id, i])), [ingredients]);
  const [rows, setRows] = useState<GridRow[]>(() => [
    ...ingredients.map((i) => ({ key: i.id, values: valuesOf(i) })),
    blankRow(COLUMNS),
  ]);
  const [showAllErrors, setShowAllErrors] = useState(false);
  const [busy, setBusy] = useState<"saving" | "importing" | null>(null);
  // Sizes typed for unit changes that don't convert on their own, by row key.
  const [unitSizes, setUnitSizes] = useState<Record<string, string>>({});

  const pending = rows.filter((r) => {
    if (isBlankRow(COLUMNS, r)) return false;
    const orig = byId.get(r.key);
    if (!orig) return true;
    const o = valuesOf(orig);
    return COLUMNS.some((c) => (r.values[c.key] ?? "").trim() !== o[c.key as keyof typeof o]);
  });

  // Existing rows whose base unit changes. lb → oz converts by itself; lb →
  // case uses the material's case size if it has one, else asks "1 case =
  // ? lb", whichever way the change goes. `perOld` is how many of the new
  // unit are in one of the old (1/36 for lb → a 36 lb case).
  const unitChanges = pending.flatMap((r) => {
    const orig = byId.get(r.key);
    const to = (r.values.base_unit ?? "").trim();
    if (!orig || !to || to === orig.base_unit) return [];
    const packs = cleanPackSizes(orig.pack_sizes);
    if (!needsUnitSize(orig.base_unit, to, packs)) {
      const known = packSizeFor(packs, to);
      return known ? [{ row: r, from: orig.base_unit, to, known, intoContainer: true, perOld: null as number | null }] : [];
    }
    const intoContainer = isContainerUnit(to) || !isContainerUnit(orig.base_unit);
    const n = parseNumber(unitSizes[r.key] ?? "");
    const perOld = n != null && n > 0 ? (intoContainer ? 1 / n : n) : null;
    return [{ row: r, from: orig.base_unit, to, known: null as number | null, intoContainer, perOld }];
  });
  const missingSizes = unitChanges.filter((c) => c.known == null && c.perOld == null);

  async function post(body: BodyInit, contentType: string) {
    const res = await fetch("/api/ingredients/import", { method: "POST", headers: { "Content-Type": contentType, [LOCAL_DATE_HEADER]: browserLocalDate() }, body });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const details = (json.row_errors ?? []).map((e: { row: number; message: string }) => `Row ${e.row}: ${e.message}`);
      throw Object.assign(new Error(json.error ?? `Request failed (${res.status})`), { details });
    }
    return json as { inserted: number; updated: number; unchanged: number; embedding_error: string | null };
  }

  function report(result: { inserted: number; updated: number; unchanged: number; embedding_error: string | null }) {
    setMessage({
      kind: "ok",
      text: `Saved — ${result.inserted} added, ${result.updated} updated, ${result.unchanged} unchanged.${
        result.embedding_error ? " (Matching for new names will catch up later.)" : ""
      }`,
    });
    router.refresh();
  }

  async function save() {
    setShowAllErrors(true);
    setMessage(null);
    const errors = gridErrors(COLUMNS, rows);
    if (errors.size) {
      setMessage({ kind: "error", text: `Fix the ${errors.size} highlighted row${errors.size === 1 ? "" : "s"} first — nothing was saved.` });
      return;
    }
    if (missingSizes.length) {
      setMessage({ kind: "error", text: `Say how the units relate for ${missingSizes.map((c) => c.row.values.name).join(", ")} first — nothing was saved.` });
      return;
    }
    setBusy("saving");
    try {
      const payload = pending.map((r) => ({
        row: rows.indexOf(r) + 1, // the grid's own # column, so server errors point at the right row
        id: byId.has(r.key) ? r.key : null,
        ...r.values,
        new_unit_per_old: unitChanges.find((c) => c.row.key === r.key)?.perOld ?? null,
      }));
      report(await post(JSON.stringify({ rows: payload }), "application/json"));
    } catch (err) {
      setMessage({ kind: "error", text: (err as Error).message, details: (err as { details?: string[] }).details });
    } finally {
      setBusy(null);
    }
  }

  async function importCsv(file: File) {
    setMessage(null);
    setBusy("importing");
    try {
      report(await post(await file.text(), "text/csv"));
    } catch (err) {
      setMessage({ kind: "error", text: (err as Error).message, details: (err as { details?: string[] }).details });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <a href="/api/ingredients/export" download className="rounded-md border border-stone-300 bg-white px-3 py-1.5 font-medium text-stone-700 hover:border-stone-400">
          Export CSV
        </a>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          aria-label={`Import ${v.ingredients.toLowerCase()} CSV`}
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) importCsv(f);
          }}
        />
        <button
          type="button"
          disabled={!!busy}
          onClick={() => fileRef.current?.click()}
          className="rounded-md border border-stone-300 bg-white px-3 py-1.5 font-medium text-stone-700 hover:border-stone-400 disabled:opacity-40"
        >
          {busy === "importing" ? "Importing…" : "Import CSV"}
        </button>
        <span className="text-xs text-zinc-500">Edit the export in any spreadsheet and import it back — rows match by id, then name.</span>
      </div>

      <EditableGrid
        label={v.ingredients}
        columns={COLUMNS}
        rows={rows}
        onChange={setRows}
        showAllErrors={showAllErrors}
        canDeleteRow={(r) => !byId.has(r.key)}
        onDeleteRow={(r) => setRows(rows.filter((x) => x.key !== r.key))}
      />

      {unitChanges.length > 0 && (
        <section aria-label="Unit changes" data-testid="unit-changes" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-950">
          <p className="font-medium">Changing units</p>
          <p className="text-xs text-amber-900">The price, pack sizes and every {v.recipe.toLowerCase()} amount move to the new unit, so nothing costs more or less than before.</p>
          <ul className="mt-2 flex flex-col gap-2">
            {unitChanges.map((c) => {
              const big = c.intoContainer ? c.to : c.from;
              const small = c.intoContainer ? c.from : c.to;
              return (
                <li key={c.row.key} className="flex flex-wrap items-center gap-2">
                  <b>{c.row.values.name}</b> {c.from} → {c.to}:
                  {c.known != null ? (
                    <span>
                      {/* known: how many of the old unit in one new; read it the way round that's a whole number */}
                      using its size, {c.known >= 1 ? `1 ${c.to} = ${+c.known.toFixed(4)} ${c.from}` : `1 ${c.from} = ${+(1 / c.known).toFixed(4)} ${c.to}`}
                    </span>
                  ) : (
                    <label className="flex items-center gap-1.5">
                      1 {big} =
                      <input
                        inputMode="decimal"
                        aria-label={`How many ${small} in one ${big} for ${c.row.values.name}`}
                        value={unitSizes[c.row.key] ?? ""}
                        onChange={(e) => setUnitSizes({ ...unitSizes, [c.row.key]: e.target.value })}
                        className={`w-20 rounded-md border bg-white px-2 py-1 text-right tabular-nums ${showAllErrors && c.perOld == null ? "border-red-400" : "border-stone-300"}`}
                      />
                      {small}
                    </label>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={!!busy || pending.length === 0}
          className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-40"
        >
          {busy === "saving" ? "Saving…" : pending.length ? `Save ${pending.length} change${pending.length === 1 ? "" : "s"}` : "No changes"}
        </button>
        {message && (
          <div role="status" className={`text-sm ${message.kind === "error" ? "text-red-600" : "text-green-700"}`}>
            <p>{message.text}</p>
            {message.details?.map((d) => (
              <p key={d} className="text-xs">
                {d}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
