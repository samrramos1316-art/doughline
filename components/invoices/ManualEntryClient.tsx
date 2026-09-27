"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
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
import { LineItemStatusBadge } from "@/components/invoices/LineItemStatusBadge";

export type ExistingLine = {
  id: string;
  raw_text: string;
  quantity: number | null;
  unit: string | null;
  unit_cost: number | null;
  line_total: number | null;
  pack_quantity: number | null;
  pack_unit: string | null;
  match_status: string;
  entry_method: string;
  ingredient_name: string | null;
  base_unit: string | null;
  base_unit_cost: number | null;
  price_applied: boolean;
  price_note: string | null;
};

type Header = {
  vendor_name: string;
  invoice_number: string;
  invoice_date: string;
};

const INVOICE_UNITS = ["CS", "BG", "EA", "BX", "PK", "LB", "OZ", "GAL", "QT", "DZ", "KG"];
const PACK_UNITS = ["lb", "oz", "kg", "g", "dozen", "each", "gal", "qt", "l", "ml"];
const PRICE_KEYS = ["unit", "unit_cost", "pack_quantity", "pack_unit"];
const FIELD_KEYS = ["raw_text", "quantity", "unit", "unit_cost", "pack_quantity", "pack_unit", "line_total"] as const;

const str = (v: number | string | null) => (v == null ? "" : String(v));

type Message = { kind: "error" | "ok"; text: string } | null;
type Props = {
  invoiceId: string;
  header: Header;
  vendorNames: string[];
  lines: ExistingLine[];
};

// The grid remounts whenever the stored lines change (after a save), so it
// restarts from what's actually in the database; the save message lives out
// here so it survives that.
export function ManualEntryClient(props: Props) {
  const [message, setMessage] = useState<Message>(null);
  const version = props.lines.map((l) => `${l.id}:${l.match_status}:${l.raw_text}:${l.unit_cost}`).join("|");
  return <ManualEntryForm key={version} {...props} message={message} setMessage={setMessage} />;
}

function ManualEntryForm({
  invoiceId,
  header: initialHeader,
  vendorNames,
  lines,
  message,
  setMessage,
}: Props & { message: Message; setMessage: (m: Message) => void }) {
  const router = useRouter();
  const byId = useMemo(() => new Map(lines.map((l) => [l.id, l])), [lines]);

  const columns: GridColumn[] = useMemo(
    () =>
      (
        [
          {
            key: "raw_text",
            label: "Item (as printed)",
            required: true,
            placeholder: "e.g. BUTTER SWT UNSLTD 36/1#",
            minWidth: 220,
          },
          {
            key: "quantity",
            label: "Qty",
            type: "number",
            align: "right",
            minWidth: 64,
          },
          {
            key: "unit",
            label: "Unit",
            suggestions: INVOICE_UNITS,
            minWidth: 72,
          },
          {
            key: "unit_cost",
            label: "Unit price",
            type: "number",
            align: "right",
            minWidth: 96,
          },
          {
            key: "pack_quantity",
            label: "Pack size",
            type: "number",
            align: "right",
            minWidth: 84,
            validate: (v, row) => (!row.pack_unit?.trim() ? "Add the pack unit too (lb, oz, dozen…)" : null),
          },
          {
            key: "pack_unit",
            label: "Pack unit",
            suggestions: PACK_UNITS,
            minWidth: 84,
            validate: (v, row) => (!row.pack_quantity?.trim() ? "Add the pack size too" : null),
          },
          {
            key: "line_total",
            label: "Line total",
            type: "number",
            align: "right",
            minWidth: 96,
            // Catches the classic typo: the line doesn't add up.
            validate: (v, row) => {
              const q = parseNumber(row.quantity ?? "");
              const c = parseNumber(row.unit_cost ?? "");
              const t = parseNumber(v);
              if (q == null || c == null || t == null || [q, c, t].some((n) => !Number.isFinite(n))) return null;
              return Math.abs(q * c - t) > 0.011
                ? `${q} × $${c.toFixed(2)} = $${(q * c).toFixed(2)}, not $${t.toFixed(2)}`
                : null;
            },
          },
        ] as GridColumn[]
      ).map((c) => ({
        ...c,
        // A price already in the ingredient's costs is locked (the API refuses it too).
        readOnly: PRICE_KEYS.includes(c.key) ? (row: GridRow) => !!byId.get(row.key)?.price_applied : undefined,
      })),
    [byId],
  );

  const [header, setHeader] = useState(initialHeader);
  const [rows, setRows] = useState<GridRow[]>(() => [
    ...lines.map((l) => ({
      key: l.id,
      values: {
        raw_text: l.raw_text,
        quantity: str(l.quantity),
        unit: str(l.unit),
        unit_cost: str(l.unit_cost),
        pack_quantity: str(l.pack_quantity),
        pack_unit: str(l.pack_unit),
        line_total: str(l.line_total),
      },
    })),
    blankRow(columns),
  ]);
  const [showAllErrors, setShowAllErrors] = useState(false);
  const [saving, setSaving] = useState(false);

  const newRows = rows.filter((r) => r.isNew && !isBlankRow(columns, r));
  const changedRows = rows.filter((r) => {
    const orig = byId.get(r.key);
    if (!orig) return false;
    const origValues: Record<string, string> = {
      raw_text: orig.raw_text,
      quantity: str(orig.quantity),
      unit: str(orig.unit),
      unit_cost: str(orig.unit_cost),
      pack_quantity: str(orig.pack_quantity),
      pack_unit: str(orig.pack_unit),
      line_total: str(orig.line_total),
    };
    return FIELD_KEYS.some((k) => (r.values[k] ?? "").trim() !== origValues[k]);
  });
  const headerChanged = (Object.keys(header) as (keyof Header)[]).some((k) => header[k].trim() !== initialHeader[k]);
  const dirty = newRows.length + changedRows.length > 0 || headerChanged;

  function toPayload(r: GridRow) {
    const n = (k: string) => parseNumber(r.values[k] ?? "");
    const t = (k: string) => (r.values[k] ?? "").trim() || null;
    return {
      raw_text: (r.values.raw_text ?? "").trim(),
      quantity: n("quantity"),
      unit: t("unit"),
      unit_cost: n("unit_cost"),
      line_total: n("line_total"),
      pack_quantity: n("pack_quantity"),
      pack_unit: t("pack_unit"),
    };
  }

  async function send(method: string, url: string, body: unknown) {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
    return json;
  }

  async function save() {
    setShowAllErrors(true);
    setMessage(null);
    const errors = gridErrors(columns, rows);
    if (errors.size) {
      setMessage({
        kind: "error",
        text: `Fix the ${errors.size} highlighted row${errors.size === 1 ? "" : "s"} first — nothing was saved.`,
      });
      return;
    }
    setSaving(true);
    try {
      // Header first: the vendor keys alias memory for the lines below.
      if (headerChanged) {
        await send("PATCH", `/api/invoices/${invoiceId}`, {
          vendor_name: header.vendor_name.trim() || null,
          invoice_number: header.invoice_number.trim() || null,
          invoice_date: header.invoice_date || null,
        });
      }
      for (const r of changedRows) await send("PATCH", `/api/line-items/${r.key}`, toPayload(r));
      let summary = "";
      if (newRows.length) {
        const res = await send("POST", `/api/invoices/${invoiceId}/line-items`, { lines: newRows.map(toPayload) });
        const statuses: string[] = res.line_items.map((l: { match_status: string }) => l.match_status);
        const matched = statuses.filter((s) => s === "auto_matched").length;
        summary = ` ${newRows.length} added — ${matched} matched automatically, ${newRows.length - matched} to review.`;
      }
      setMessage({ kind: "ok", text: `Saved.${summary}` });
      router.refresh();
    } catch (err) {
      setMessage({
        kind: "error",
        text: err instanceof Error ? err.message : "Saving failed",
      });
    } finally {
      setSaving(false);
    }
  }

  const unresolved = lines.filter((l) => ["pending", "needs_review", "new_ingredient"].includes(l.match_status)).length;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm text-zinc-700">
          Vendor
          <input
            list="vendor-names"
            value={header.vendor_name}
            onChange={(e) => setHeader({ ...header, vendor_name: e.target.value })}
            placeholder="e.g. Sysco"
            className="rounded-lg border border-zinc-300 px-3 py-2"
          />
          <datalist id="vendor-names">
            {vendorNames.map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
        </label>
        <label className="flex flex-col gap-1 text-sm text-zinc-700">
          Invoice #
          <input
            value={header.invoice_number}
            onChange={(e) => setHeader({ ...header, invoice_number: e.target.value })}
            className="rounded-lg border border-zinc-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-zinc-700">
          Invoice date
          <input
            type="date"
            value={header.invoice_date}
            onChange={(e) => setHeader({ ...header, invoice_date: e.target.value })}
            className="rounded-lg border border-zinc-300 px-3 py-2"
          />
        </label>
      </div>

      <p className="text-xs text-zinc-500">
        Tab across, Enter to go down. Paste rows straight from a spreadsheet into any cell. Pack size is what one unit
        holds (a 36 lb case → 36, lb) so the price can be costed per pound.
      </p>

      <EditableGrid
        label="Invoice line items"
        columns={columns}
        rows={rows}
        onChange={setRows}
        showAllErrors={showAllErrors}
        canDeleteRow={(r) => !!r.isNew}
        onDeleteRow={(r) => setRows(rows.filter((x) => x.key !== r.key))}
        renderRowStatus={(row) => {
          const l = byId.get(row.key);
          if (!l) return <span className="text-zinc-400">New</span>;
          return (
            <div className="flex flex-col gap-1">
              <LineItemStatusBadge status={l.match_status} />
              {l.ingredient_name && <span className="text-zinc-600">→ {l.ingredient_name}</span>}
              {l.base_unit_cost != null && (
                <span className="text-zinc-500">
                  ${Number(l.base_unit_cost).toFixed(4)}/{l.base_unit}
                </span>
              )}
              {l.price_note && <span className="text-amber-700">{l.price_note}</span>}
            </div>
          );
        }}
      />

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-40"
        >
          {saving ? "Saving & matching…" : "Save lines"}
        </button>
        {unresolved > 0 && (
          <Link href={`/invoices/${invoiceId}/review`} className="text-sm font-medium text-amber-800 underline">
            Review {unresolved} match{unresolved === 1 ? "" : "es"} →
          </Link>
        )}
        {message && (
          <p role="status" className={`text-sm ${message.kind === "error" ? "text-red-600" : "text-green-700"}`}>
            {message.text}
          </p>
        )}
      </div>
    </div>
  );
}
