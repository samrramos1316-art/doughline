"use client";

import { useRef, useState } from "react";

export type GridValues = Record<string, string>;

export type GridColumn = {
  key: string;
  label: string;
  type?: "text" | "number" | "select";
  options?: { value: string; label: string }[]; // for "select"
  suggestions?: string[]; // free-text autocomplete (datalist)
  required?: boolean;
  validate?: (value: string, row: GridValues) => string | null;
  placeholder?: string;
  minWidth?: number; // px; the grid scrolls sideways past the sum
  align?: "left" | "right";
  readOnly?: (row: GridRow) => boolean;
};

export type GridRow = {
  key: string; // stable React key; existing records use their id
  values: GridValues;
  isNew?: boolean;
};

// "$1,234.50" → 1234.5; "10%" → 10; blank → null; junk → NaN.
export function parseNumber(value: string): number | null {
  const t = value.trim().replace(/^\$/, "").replace(/%$/, "").replace(/,/g, "");
  return t === "" ? null : Number(t);
}

export function isBlankRow(columns: GridColumn[], row: GridRow) {
  return columns.every((c) => !(row.values[c.key] ?? "").trim());
}

export function cellError(column: GridColumn, row: GridRow): string | null {
  const v = (row.values[column.key] ?? "").trim();
  if (!v) return column.required ? `${column.label} is required` : null;
  if (column.type === "number") {
    const n = parseNumber(v);
    if (n == null || !Number.isFinite(n)) return `"${v}" isn't a number`;
    if (n < 0) return `${column.label} can't be negative`;
  }
  if (column.type === "select" && column.options && !column.options.some((o) => o.value === v)) {
    return `No ${column.label.toLowerCase()} called "${v}"`;
  }
  return column.validate?.(v, row.values) ?? null;
}

// Errors for every non-blank row, keyed by row key then column key.
export function gridErrors(columns: GridColumn[], rows: GridRow[]) {
  const out = new Map<string, Record<string, string>>();
  for (const row of rows) {
    if (isBlankRow(columns, row)) continue;
    const errs: Record<string, string> = {};
    for (const c of columns) {
      if (c.readOnly?.(row)) continue;
      const e = cellError(c, row);
      if (e) errs[c.key] = e;
    }
    if (Object.keys(errs).length) out.set(row.key, errs);
  }
  return out;
}

let newRowCounter = 0;
export function blankRow(columns: GridColumn[]): GridRow {
  newRowCounter += 1;
  return { key: `new-${Date.now()}-${newRowCounter}`, isNew: true, values: Object.fromEntries(columns.map((c) => [c.key, ""])) };
}

// Match pasted text to a select option by value or label, ignoring case.
function resolveOption(column: GridColumn, text: string) {
  const t = text.trim().toLowerCase();
  const hit = column.options?.find((o) => o.value.toLowerCase() === t || o.label.toLowerCase() === t);
  return hit ? hit.value : text.trim();
}

// §9.2: one spreadsheet-style editor behind the invoice-line, ingredient and
// recipe-ingredient screens. Tab moves across (native order), Enter / ↑ ↓
// move down and up a column, pasting a block copied from a spreadsheet fills
// cells from the one you paste into (adding rows as needed), and each cell
// validates inline. A blank row always waits at the bottom; fully blank rows
// are ignored by validation and by the caller's save.
export function EditableGrid({
  label,
  columns,
  rows,
  onChange,
  showAllErrors = false,
  renderRowStatus,
  canDeleteRow,
  onDeleteRow,
}: {
  label: string;
  columns: GridColumn[];
  rows: GridRow[];
  onChange: (rows: GridRow[]) => void;
  showAllErrors?: boolean;
  renderRowStatus?: (row: GridRow) => React.ReactNode;
  canDeleteRow?: (row: GridRow) => boolean;
  onDeleteRow?: (row: GridRow) => void;
}) {
  const tableRef = useRef<HTMLTableElement>(null);
  const [touched, setTouched] = useState<Set<string>>(new Set());

  // Keep exactly one trailing blank row.
  function withTrailingBlank(next: GridRow[]) {
    const last = next[next.length - 1];
    return !last || !isBlankRow(columns, last) || !last.isNew ? [...next, blankRow(columns)] : next;
  }

  function setCell(rowIndex: number, colKey: string, value: string) {
    const next = rows.map((r, i) => (i === rowIndex ? { ...r, values: { ...r.values, [colKey]: value } } : r));
    onChange(withTrailingBlank(next));
  }

  function focusCell(rowIndex: number, colIndex: number) {
    const el = tableRef.current?.querySelector<HTMLElement>(`[data-cell="${rowIndex}:${colIndex}"]`);
    el?.focus();
    if (el instanceof HTMLInputElement) el.select();
  }

  function handleKeyDown(e: React.KeyboardEvent, rowIndex: number, colIndex: number, isSelect: boolean) {
    if (e.key === "Enter") {
      e.preventDefault();
      focusCell(rowIndex + (e.shiftKey ? -1 : 1), colIndex);
    } else if (!isSelect && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      focusCell(rowIndex + (e.key === "ArrowDown" ? 1 : -1), colIndex);
    }
  }

  function handlePaste(e: React.ClipboardEvent, rowIndex: number, colIndex: number) {
    const text = e.clipboardData.getData("text/plain");
    if (!/[\t\n]/.test(text)) return; // a single value: let the browser paste it
    e.preventDefault();
    const block = text.replace(/\r/g, "").replace(/\n$/, "").split("\n").map((line) => line.split("\t"));
    const next = [...rows];
    const newlyTouched = new Set(touched);
    block.forEach((cells, dr) => {
      const r = rowIndex + dr;
      if (!next[r]) next[r] = blankRow(columns);
      const values = { ...next[r].values };
      cells.forEach((cell, dc) => {
        const col = columns[colIndex + dc];
        if (!col || col.readOnly?.(next[r])) return;
        values[col.key] = col.type === "select" ? resolveOption(col, cell) : cell.trim();
        newlyTouched.add(`${next[r].key}:${col.key}`);
      });
      next[r] = { ...next[r], values };
    });
    setTouched(newlyTouched);
    onChange(withTrailingBlank(next));
  }

  const errors = gridErrors(columns, rows);
  const hasActions = !!(canDeleteRow && onDeleteRow);

  return (
    <div className="w-full overflow-x-auto rounded-xl border border-zinc-200 bg-white">
      <table ref={tableRef} aria-label={label} className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs font-medium text-zinc-500">
            <th className="w-8 px-2 py-2 text-right font-normal">#</th>
            {columns.map((c) => (
              <th key={c.key} className="px-2 py-2" style={{ minWidth: c.minWidth }}>
                {c.label}
                {c.required && <span className="text-red-500"> *</span>}
              </th>
            ))}
            {renderRowStatus && <th className="min-w-40 px-2 py-2">Status</th>}
            {hasActions && <th className="w-8" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => {
            const rowErrors = errors.get(row.key) ?? {};
            return (
              <tr key={row.key} data-row={r} className="border-b border-zinc-100 align-top last:border-0">
                <td className="px-2 py-2 text-right text-xs text-zinc-400">{r + 1}</td>
                {columns.map((c, ci) => {
                  const readOnly = c.readOnly?.(row) ?? false;
                  const value = row.values[c.key] ?? "";
                  const err = rowErrors[c.key];
                  const showErr = !!err && (showAllErrors || touched.has(`${row.key}:${c.key}`));
                  const common = {
                    "data-cell": `${r}:${ci}`,
                    "aria-label": `${c.label}, row ${r + 1}`,
                    "aria-invalid": showErr || undefined,
                    title: showErr ? err : undefined,
                    disabled: readOnly,
                    onBlur: () => setTouched((t) => new Set(t).add(`${row.key}:${c.key}`)),
                    onPaste: (e: React.ClipboardEvent) => handlePaste(e, r, ci),
                    className: `w-full min-w-0 rounded-md border px-2 py-1.5 outline-none focus:ring-2 disabled:bg-zinc-50 disabled:text-zinc-500 ${
                      c.align === "right" ? "text-right tabular-nums" : ""
                    } ${showErr ? "border-red-400 bg-red-50 focus:ring-red-200" : "border-zinc-200 focus:border-zinc-400 focus:ring-zinc-200"}`,
                  };
                  return (
                    <td key={c.key} className="px-1 py-1" style={{ minWidth: c.minWidth }}>
                      {c.type === "select" ? (
                        <select
                          {...common}
                          value={value}
                          onChange={(e) => setCell(r, c.key, e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, r, ci, true)}
                        >
                          <option value="">{c.placeholder ?? "Choose…"}</option>
                          {value && !c.options?.some((o) => o.value === value) && <option value={value}>⚠ {value}</option>}
                          {c.options?.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          {...common}
                          type="text"
                          inputMode={c.type === "number" ? "decimal" : undefined}
                          list={c.suggestions ? `grid-${c.key}-list` : undefined}
                          value={value}
                          placeholder={c.placeholder}
                          onChange={(e) => setCell(r, c.key, e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, r, ci, false)}
                        />
                      )}
                      {showErr && (
                        <p role="alert" className="mt-0.5 text-xs text-red-600">
                          {err}
                        </p>
                      )}
                    </td>
                  );
                })}
                {renderRowStatus && <td className="px-2 py-2 text-xs">{isBlankRow(columns, row) ? null : renderRowStatus(row)}</td>}
                {hasActions && (
                  <td className="px-1 py-1">
                    {canDeleteRow!(row) && !isBlankRow(columns, row) && (
                      <button
                        type="button"
                        aria-label={`Remove row ${r + 1}`}
                        onClick={() => onDeleteRow!(row)}
                        className="rounded px-2 py-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                      >
                        ✕
                      </button>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {columns
        .filter((c) => c.suggestions)
        .map((c) => (
          <datalist key={c.key} id={`grid-${c.key}-list`}>
            {c.suggestions!.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        ))}
    </div>
  );
}
