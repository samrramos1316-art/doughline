"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  EditableGrid,
  blankRow,
  gridErrors,
  isBlankRow,
  type GridColumn,
  type GridRow,
} from "@/components/grid/EditableGrid";
import { LOCAL_DATE_HEADER, browserLocalDate } from "@/lib/dates/localDate";

export type IngredientRecord = {
  id: string;
  name: string;
  category: string | null;
  base_unit: string;
  current_unit_cost: number | null;
};

type Message = { kind: "error" | "ok"; text: string; details?: string[] } | null;

const CATEGORIES = ["dairy", "dry_goods", "produce", "protein", "packaging", "beverage", "frozen"];
const BASE_UNITS = ["lb", "oz", "kg", "g", "each", "dozen", "gal", "qt", "l", "ml"];
const COLUMNS: GridColumn[] = [
  { key: "name", label: "Name", required: true, minWidth: 240 },
  { key: "category", label: "Category", suggestions: CATEGORIES, minWidth: 140 },
  { key: "base_unit", label: "Base unit", required: true, suggestions: BASE_UNITS, minWidth: 110 },
  { key: "current_unit_cost", label: "Cost / unit", type: "number", align: "right", minWidth: 110 },
];

const valuesOf = (i: IngredientRecord) => ({
  name: i.name,
  category: i.category ?? "",
  base_unit: i.base_unit,
  current_unit_cost: i.current_unit_cost == null ? "" : String(i.current_unit_cost),
});

// §9.2: the ingredient master list as a spreadsheet — edit cells in place,
// paste rows from a sheet, then save once. Saves go through the same bulk
// upsert as CSV import (one embedding call for everything new or renamed).
// A remount after save (keyed on the stored list) restarts from the database.
export function IngredientsGrid({ ingredients }: { ingredients: IngredientRecord[] }) {
  const [message, setMessage] = useState<Message>(null);
  const version = ingredients.map((i) => `${i.id}:${i.name}:${i.current_unit_cost}:${i.base_unit}:${i.category}`).join("|");
  return <IngredientsGridForm key={version} ingredients={ingredients} message={message} setMessage={setMessage} />;
}

function IngredientsGridForm({
  ingredients,
  message,
  setMessage,
}: {
  ingredients: IngredientRecord[];
  message: Message;
  setMessage: (m: Message) => void;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const byId = useMemo(() => new Map(ingredients.map((i) => [i.id, i])), [ingredients]);
  const [rows, setRows] = useState<GridRow[]>(() => [
    ...ingredients.map((i) => ({ key: i.id, values: valuesOf(i) })),
    blankRow(COLUMNS),
  ]);
  const [showAllErrors, setShowAllErrors] = useState(false);
  const [busy, setBusy] = useState<"saving" | "importing" | null>(null);

  const pending = rows.filter((r) => {
    if (isBlankRow(COLUMNS, r)) return false;
    const orig = byId.get(r.key);
    if (!orig) return true;
    const o = valuesOf(orig);
    return COLUMNS.some((c) => (r.values[c.key] ?? "").trim() !== o[c.key as keyof typeof o]);
  });

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
    setBusy("saving");
    try {
      const payload = pending.map((r) => ({
        row: rows.indexOf(r) + 1, // the grid's own # column, so server errors point at the right row
        id: byId.has(r.key) ? r.key : null,
        ...r.values,
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
        <a href="/api/ingredients/export" download className="rounded-full border border-zinc-300 px-4 py-2 font-medium text-zinc-700">
          Export CSV
        </a>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          aria-label="Import ingredients CSV"
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
          className="rounded-full border border-zinc-300 px-4 py-2 font-medium text-zinc-700 disabled:opacity-40"
        >
          {busy === "importing" ? "Importing…" : "Import CSV"}
        </button>
        <span className="text-xs text-zinc-500">Edit the export in any spreadsheet and import it back — rows match by id, then name.</span>
      </div>

      <EditableGrid
        label="Ingredients"
        columns={COLUMNS}
        rows={rows}
        onChange={setRows}
        showAllErrors={showAllErrors}
        canDeleteRow={(r) => !byId.has(r.key)}
        onDeleteRow={(r) => setRows(rows.filter((x) => x.key !== r.key))}
      />

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={!!busy || pending.length === 0}
          className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-40"
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
