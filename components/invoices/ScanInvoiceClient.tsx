"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { compressImage } from "@/lib/media/compressImage";
import { CaptureButton } from "@/components/camera/CaptureButton";

type Stage = "idle" | "previewing" | "uploading" | "done" | "error";

export function ScanInvoiceClient({ orgId }: { orgId: string }) {
  const [stage, setStage] = useState<Stage>("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

      setStage("done");
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

      {stage === "done" && (
        <div className="flex flex-col items-center gap-3">
          <p className="text-sm font-medium text-green-700">
            Uploaded. This invoice is pending — extraction isn&apos;t wired up yet.
          </p>
          <button
            type="button"
            onClick={reset}
            className="rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-700"
          >
            Scan another
          </button>
        </div>
      )}

      {stage === "error" && (
        <div className="flex flex-col items-center gap-3">
          <p className="text-sm font-medium text-red-600">{errorMessage}</p>
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
