"use client";

import { useRef } from "react";

// `capture="environment"` opens the rear camera directly on mobile with no
// extra permission prompt beyond the OS camera picker (§5.2 step 1) — works
// on desktop too, falling back to a normal file picker.
export function CaptureButton({ onCapture }: { onCapture: (file: File, previewUrl: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    onCapture(file, URL.createObjectURL(file));
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleChange}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        aria-label="Scan invoice"
        className="flex h-16 w-16 items-center justify-center rounded-full bg-zinc-900 text-white shadow-lg transition-transform active:scale-95"
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 8a2 2 0 0 1 2-2h1.2a1 1 0 0 0 .8-.4l1-1.3A1 1 0 0 1 9.8 4h4.4a1 1 0 0 1 .8.3l1 1.3a1 1 0 0 0 .8.4H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Z" />
          <circle cx="12" cy="13" r="3.5" />
        </svg>
      </button>
    </>
  );
}
