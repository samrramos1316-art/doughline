"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { compressImage } from "@/lib/media/compressImage";
import { useVocab } from "@/components/app/VocabProvider";
import { lower, menuDoc, withArticle } from "@/lib/vocab";

const MAX_FILES = 25; // matches BULK_IMPORT_MAX on the server
const MAX_PDF_BYTES = 20 * 1024 * 1024;

type ItemStatus = "ready" | "uploading" | "queued" | "reading" | "needs_review" | "completed" | "failed" | "not_invoice" | "error";

type Item = {
  key: string;
  name: string;
  file?: File;
  kind: "image" | "pdf";
  invoiceId?: string;
  status: ItemStatus;
  lines?: number;
  message?: string;
  importUrl?: string | null;
};

export type WaitingInvoice = { id: string; file_type: string; created_at: string };

const STATUS_TEXT: Record<ItemStatus, string> = {
  ready: "Ready",
  uploading: "Uploading…",
  queued: "Waiting to be read",
  reading: "Reading…",
  needs_review: "Needs review",
  completed: "Done",
  failed: "Couldn't read it",
  not_invoice: "Not an invoice",
  error: "Error",
};

const STATUS_CLASS: Record<ItemStatus, string> = {
  ready: "text-zinc-500",
  uploading: "text-zinc-500",
  queued: "text-zinc-500",
  reading: "text-blue-700",
  needs_review: "text-amber-700",
  completed: "text-green-700",
  failed: "text-red-700",
  not_invoice: "text-amber-700",
  error: "text-red-700",
};

// §9.1: a desk-side backfill of past invoices — many photos and PDFs at
// once. Every file is uploaded, all invoice rows are created in one
// POST /api/invoices/bulk, then each is read (POST …/scan) one at a time as
// a queue. Anything the vision model can't read lands as 'failed' with a
// link straight to manual entry (§9.2). Rows are created before reading
// starts, so closing the tab mid-queue loses nothing: the page offers to
// finish reading them next time.
export function BulkImportClient({ orgId, waiting }: { orgId: string; waiting: WaitingInvoice[] }) {
  const v = useVocab();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (key: string, patch: Partial<Item>) =>
    setItems((all) => all.map((it) => (it.key === key ? { ...it, ...patch } : it)));

  function addFiles(files: FileList | File[]) {
    setError(null);
    const accepted: Item[] = [];
    const rejected: string[] = [];
    for (const file of Array.from(files)) {
      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      const isImage = file.type.startsWith("image/");
      if (!isPdf && !isImage) rejected.push(`${file.name} (not an image or PDF)`);
      else if (isPdf && file.size > MAX_PDF_BYTES) rejected.push(`${file.name} (PDF over 20 MB)`);
      else accepted.push({ key: crypto.randomUUID(), name: file.name, file, kind: isPdf ? "pdf" : "image", status: "ready" });
    }
    setItems((current) => {
      const room = MAX_FILES - current.filter((i) => i.status === "ready").length;
      if (accepted.length > room) rejected.push(`${accepted.length - room} file(s) over the ${MAX_FILES}-file limit`);
      return [...current, ...accepted.slice(0, Math.max(room, 0))];
    });
    if (rejected.length) setError(`Skipped: ${rejected.join(", ")}`);
  }

  // Read invoices one at a time: each call runs Claude + Voyage, and the
  // queue keeps well inside both APIs' rate limits.
  async function readQueue(queue: { key: string; invoiceId: string }[]) {
    for (const { key, invoiceId } of queue) {
      update(key, { status: "reading" });
      try {
        const res = await fetch(`/api/invoices/${invoiceId}/scan`, { method: "POST" });
        const body = await res.json().catch(() => ({}));
        if (res.status === 422 && body.not_invoice) {
          // Not an invoice (a menu, a recipe, something else): the route
          // dropped the invoice row; menus and recipes get a link that reads
          // the same file in their own import.
          update(key, { status: "not_invoice", invoiceId: undefined, message: body.error, importUrl: body.import_url });
          continue;
        }
        if (!res.ok) {
          // 502 = extraction threw; the route has already marked it 'failed'.
          update(key, res.status === 502 ? { status: "failed", message: body.error } : { status: "error", message: body.error ?? `HTTP ${res.status}` });
          continue;
        }
        update(key, {
          status: body.status === "failed" ? "failed" : body.status === "completed" ? "completed" : "needs_review",
          lines: body.line_items?.length ?? 0,
          message: body.status === "failed" ? "No purchased items found on it" : undefined,
        });
      } catch (err) {
        update(key, { status: "error", message: err instanceof Error ? err.message : "Network error" });
      }
    }
  }

  async function importAll() {
    const ready = items.filter((i) => i.status === "ready" && i.file);
    if (!ready.length) return;
    setRunning(true);
    setError(null);
    const supabase = createClient();
    const uploaded: { key: string; id: string; file_storage_path: string; file_type: "image" | "pdf" }[] = [];

    for (const it of ready) {
      const file = it.file;
      if (!file) continue;
      update(it.key, { status: "uploading" });
      try {
        const id = crypto.randomUUID();
        const body = it.kind === "pdf" ? file : await compressImage(file);
        const path = `${orgId}/${id}.${it.kind === "pdf" ? "pdf" : "jpg"}`;
        const { error: upErr } = await supabase.storage
          .from("invoices")
          .upload(path, body, { contentType: it.kind === "pdf" ? "application/pdf" : "image/jpeg", upsert: false });
        if (upErr) throw new Error(upErr.message);
        uploaded.push({ key: it.key, id, file_storage_path: path, file_type: it.kind });
        update(it.key, { invoiceId: id, status: "queued" });
      } catch (err) {
        update(it.key, { status: "error", message: err instanceof Error ? err.message : "Upload failed" });
      }
    }

    if (uploaded.length) {
      const res = await fetch("/api/invoices/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoices: uploaded.map(({ id, file_storage_path, file_type }) => ({ id, file_storage_path, file_type })) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Couldn't create the invoices");
        for (const u of uploaded) update(u.key, { status: "error", message: "Not imported" });
      } else {
        await readQueue(uploaded.map((u) => ({ key: u.key, invoiceId: u.id })));
      }
    }
    setRunning(false);
    router.refresh();
  }

  async function readWaiting() {
    const queued: Item[] = waiting.map((w) => ({
      key: w.id,
      name: `Imported ${new Date(w.created_at).toLocaleDateString()} (${w.file_type})`,
      kind: w.file_type === "pdf" ? "pdf" : "image",
      invoiceId: w.id,
      status: "queued",
    }));
    setItems((current) => [...current, ...queued]);
    setRunning(true);
    await readQueue(waiting.map((w) => ({ key: w.id, invoiceId: w.id })));
    setRunning(false);
    router.refresh();
  }

  const readyCount = items.filter((i) => i.status === "ready").length;
  const finished = items.filter((i) => ["needs_review", "completed", "failed", "not_invoice", "error"].includes(i.status));

  return (
    <div className="flex flex-col gap-4">
      {waiting.length > 0 && !running && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {waiting.length} imported invoice{waiting.length === 1 ? " hasn't" : "s haven't"} been read yet.
          <button type="button" onClick={readWaiting} className="rounded-full bg-amber-900 px-4 py-1.5 font-medium text-white">
            Read {waiting.length === 1 ? "it" : "them"} now
          </button>
        </div>
      )}

      <div
        data-testid="drop-zone"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!running) addFiles(e.dataTransfer.files);
        }}
        className={`flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center ${
          dragging ? "border-zinc-900 bg-zinc-100" : "border-zinc-300 bg-white"
        }`}
      >
        <p className="font-medium text-zinc-900">Drop invoice photos and PDFs here</p>
        <p className="text-sm text-zinc-500">Up to {MAX_FILES} at a time — emailed PDFs, scans, or photos.</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,application/pdf"
          aria-label="Choose invoice files"
          className="sr-only"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          disabled={running}
          onClick={() => inputRef.current?.click()}
          className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 disabled:opacity-40"
        >
          Choose files
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {items.length > 0 && (
        <ul aria-label="Import queue" className="flex flex-col divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white">
          {items.map((it) => (
            <li key={it.key} data-testid="import-item" data-status={it.status} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium text-zinc-900">{it.name}</p>
                <p className="text-xs text-zinc-500">
                  {it.kind === "pdf" ? "PDF" : "Photo"}
                  {it.lines != null && ` · ${it.lines} line${it.lines === 1 ? "" : "s"}`}
                  {it.message && ` · ${it.message}`}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`font-medium ${STATUS_CLASS[it.status]}`}>{STATUS_TEXT[it.status]}</span>
                {it.invoiceId && it.status === "failed" && (
                  <Link href={`/invoices/${it.invoiceId}/manual-entry`} className="font-medium text-zinc-900 underline">
                    Enter by hand
                  </Link>
                )}
                {it.status === "not_invoice" && it.importUrl && (
                  <Link href={it.importUrl} className="font-medium text-zinc-900 underline">
                    {it.importUrl.includes("kind=recipe") ? `Import it as ${withArticle(lower(v.recipe))}` : `Import it as ${withArticle(menuDoc(v))}`}
                  </Link>
                )}
                {it.invoiceId && it.status === "needs_review" && (
                  <Link href={`/invoices/${it.invoiceId}/review`} className="font-medium text-zinc-900 underline">
                    Review
                  </Link>
                )}
                {it.invoiceId && it.status === "completed" && (
                  <Link href={`/invoices/${it.invoiceId}`} className="font-medium text-zinc-900 underline">
                    Open
                  </Link>
                )}
                {it.status === "ready" && !running && (
                  <button
                    type="button"
                    aria-label={`Remove ${it.name}`}
                    onClick={() => setItems((all) => all.filter((x) => x.key !== it.key))}
                    className="text-zinc-400 hover:text-zinc-700"
                  >
                    ✕
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={importAll}
          disabled={running || readyCount === 0}
          className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-40"
        >
          {running ? "Importing…" : readyCount ? `Import ${readyCount} file${readyCount === 1 ? "" : "s"}` : "Import files"}
        </button>
        {!running && finished.length > 0 && (
          <p className="text-sm text-zinc-600" role="status">
            {finished.length} processed — {finished.filter((i) => i.status === "needs_review").length} need review,{" "}
            {finished.filter((i) => i.status === "failed").length} to enter by hand
            {finished.some((i) => i.status === "not_invoice") && `, ${finished.filter((i) => i.status === "not_invoice").length} not invoices`}.
          </p>
        )}
      </div>
    </div>
  );
}
