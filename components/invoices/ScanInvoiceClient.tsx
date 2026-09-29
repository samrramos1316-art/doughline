"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { compressImage } from "@/lib/media/compressImage";
import { CaptureButton } from "@/components/camera/CaptureButton";

type Stage = "idle" | "previewing" | "uploading" | "reading" | "done" | "error";

export function ScanInvoiceClient({ orgId }: { orgId: string }) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Set when the photo turned out to be a menu or recipe (§9.3).
  const [importUrl, setImportUrl] = useState<string | null>(null);

  function handleCapture(capturedFile: File, url: string) {
    setFile(capturedFile);
    setPreviewUrl(url);
    setStage("previewing");
  }

  function reset() {
    setStage("idle");
    setFile(null);
    setPreviewUrl(null);
    setErrorMessage(null);
    setImportUrl(null);
  }

  async function handleUpload() {
    if (!file) return;
    setStage("uploading");
    setErrorMessage(null);

    try {
      const compressed = await compressImage(file);
      const invoiceId = crypto.randomUUID();
      const storagePath = `${orgId}/${invoiceId}.jpg`;

      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from("invoices")
        .upload(storagePath, compressed, { contentType: "image/jpeg", upsert: false });
      if (uploadError) throw new Error(uploadError.message);

      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: invoiceId, file_storage_path: storagePath, file_type: "image" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to create invoice record");
      }

      // §5.2 steps 4-6: extract, match, route. Synchronous for v1 — a few
      // seconds — then straight to the swipe queue if anything needs a human.
      setStage("reading");
      const scanRes = await fetch(`/api/invoices/${invoiceId}/scan`, { method: "POST" });
      const scan = await scanRes.json().catch(() => ({}));
      if (scanRes.status === 422 && scan.not_invoice) setImportUrl(scan.import_url ?? null);
      if (!scanRes.ok) throw new Error(scan.error ?? "Couldn't read this invoice");

      setStage("done");
      router.push(scan.status === "needs_review" ? `/invoices/${invoiceId}/review` : `/invoices/${invoiceId}`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Upload failed");
      setStage("error");
    }
  }

  return (
    <div className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-6 py-12 text-center">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Scan Invoice</h1>
        <p className="mt-1 text-sm text-zinc-500">Snap a photo of a delivery invoice or packing slip.</p>
      </div>

      <div className="flex aspect-3/4 w-full max-w-xs items-center justify-center overflow-hidden rounded-2xl border border-dashed border-zinc-300 bg-zinc-100">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- transient object URL, not a static asset
          <img src={previewUrl} alt="Captured invoice" className="h-full w-full object-cover" />
        ) : (
          <p className="px-6 text-sm text-zinc-400">No photo yet</p>
        )}
      </div>

      {stage === "idle" && <CaptureButton onCapture={handleCapture} />}

      {stage === "previewing" && (
        <div className="flex gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-700"
          >
            Retake
          </button>
          <button
            type="button"
            onClick={handleUpload}
            className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white"
          >
            Use this photo
          </button>
        </div>
      )}

      {stage === "uploading" && (
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900" />
          Uploading…
        </div>
      )}

      {stage === "reading" && (
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900" />
          Reading invoice and matching ingredients…
        </div>
      )}

      {stage === "done" && <p className="text-sm font-medium text-green-700">Done — opening your invoice…</p>}

      {stage === "error" && (
        <div className="flex flex-col items-center gap-3">
          <p className="text-sm font-medium text-red-600">{errorMessage}</p>
          {importUrl && (
            <Link href={importUrl} className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white">
              {importUrl.includes("kind=recipe") ? "Import it as a recipe" : "Import it as a menu"}
            </Link>
          )}
          <button
            type="button"
            onClick={reset}
            className="rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-700"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
