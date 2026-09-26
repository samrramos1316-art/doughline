"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CaptureButton } from "@/components/camera/CaptureButton";

type Stage = "idle" | "previewing" | "processing";

export default function ScanInvoicePage() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  function handleCapture(_file: File, url: string) {
    setPreviewUrl(url);
    setStage("previewing");
  }

  function handleProcess() {
    setStage("processing");
    // Mock only — no real upload or vision call yet. Simulates the
    // scan-to-extraction delay from §5.2 before routing into the
    // swipe-to-verify queue, using a fixed mock invoice.
    setTimeout(() => {
      router.push("/invoices/inv-2/review");
    }, 1400);
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
            onClick={() => {
              setStage("idle");
              setPreviewUrl(null);
            }}
            className="rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-700"
          >
            Retake
          </button>
          <button
            type="button"
            onClick={handleProcess}
            className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white"
          >
            Use this photo
          </button>
        </div>
      )}

      {stage === "processing" && (
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900" />
          Reading invoice…
        </div>
      )}
    </div>
  );
}
