"use client";

import { useRef, useState } from "react";
import { useVocab } from "@/components/app/VocabProvider";
import { lower } from "@/lib/vocab";

type Candidate = { ingredient_id: string; name: string; similarity: number };

const SWIPE_THRESHOLD = 100;

export function SwipeCard({
  rawText,
  itemName,
  parsedQuantity,
  parsedUnit,
  parsedUnitCost,
  candidate,
  candidatePosition,
  lowConfidence = false,
  leftLabel,
  rightLabel,
  disabled = false,
  onSwipe,
}: {
  rawText: string;
  itemName: string | null;
  parsedQuantity: number | null;
  parsedUnit: string | null;
  parsedUnitCost: number | null;
  candidate: Candidate | null;
  candidatePosition?: string;
  lowConfidence?: boolean;
  leftLabel: string;
  rightLabel: string;
  disabled?: boolean;
  onSwipe: (direction: "left" | "right") => void;
}) {
  const v = useVocab();
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [exiting, setExiting] = useState<"left" | "right" | null>(null);
  const startX = useRef(0);

  function handlePointerDown(e: React.PointerEvent) {
    // A press on one of the card's buttons is a tap, not a drag: capturing
    // the pointer here would retarget its click to the card and the button
    // would never fire.
    if (disabled || (e.target as Element).closest("button")) return;
    setDragging(true);
    startX.current = e.clientX - dragX;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!dragging) return;
    setDragX(e.clientX - startX.current);
  }

  function finish(direction: "left" | "right") {
    if (exiting || disabled) return;
    setExiting(direction);
    setTimeout(() => onSwipe(direction), 180);
  }

  function handlePointerUp() {
    setDragging(false);
    if (dragX > SWIPE_THRESHOLD) finish("right");
    else if (dragX < -SWIPE_THRESHOLD) finish("left");
    else setDragX(0);
  }

  const translateX = exiting ? (exiting === "right" ? 600 : -600) : dragX;
  const rotation = translateX / 18;
  const confirmOpacity = Math.min(Math.max(dragX / SWIPE_THRESHOLD, 0), 1);
  const skipOpacity = Math.min(Math.max(-dragX / SWIPE_THRESHOLD, 0), 1);

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{
        transform: `translateX(${translateX}px) rotate(${rotation}deg)`,
        opacity: exiting ? 0 : 1,
        transition: dragging ? "none" : "transform 0.2s ease, opacity 0.2s ease",
        touchAction: "pan-y",
      }}
      className="absolute inset-0 flex cursor-grab select-none flex-col justify-between rounded-2xl border border-zinc-200 bg-white p-6 shadow-lg active:cursor-grabbing"
    >
      <span
        aria-hidden
        style={{ opacity: confirmOpacity }}
        className="absolute top-4 right-4 rounded-md border-2 border-green-500 px-2 py-0.5 text-sm font-bold tracking-wide text-green-500"
      >
        {rightLabel.toUpperCase()}
      </span>
      <span
        aria-hidden
        style={{ opacity: skipOpacity }}
        className="absolute top-4 left-4 rounded-md border-2 border-red-500 px-2 py-0.5 text-sm font-bold tracking-wide text-red-500"
      >
        {leftLabel.toUpperCase()}
      </span>

      <div>
        <p className="text-xs font-medium tracking-wide text-zinc-400 uppercase">Scanned as</p>
        <p className="mt-1 text-lg font-medium text-zinc-900">{rawText}</p>
        {itemName && <p className="text-sm text-zinc-600 italic">Read as “{itemName}”</p>}
        <p className="mt-1 text-sm text-zinc-500">
          {parsedQuantity ?? "—"} {parsedUnit ?? ""}
          {parsedUnitCost != null && ` · $${parsedUnitCost.toFixed(2)}`}
        </p>
      </div>

      <div className="rounded-xl bg-zinc-50 p-4 text-center">
        {candidate ? (
          <>
            <p className="text-xs font-medium tracking-wide text-zinc-400 uppercase">
              {lowConfidence ? "Low confidence — is this…" : "Is this…"}{" "}
              {candidatePosition && <span className="normal-case">({candidatePosition})</span>}
            </p>
            <p data-testid="candidate-name" className="mt-1 text-xl font-semibold text-zinc-900">
              {candidate.name}
            </p>
            <p className="text-sm text-zinc-500">{Math.round(candidate.similarity * 100)}% similar</p>
          </>
        ) : (
          <>
            <p className="text-xl font-semibold text-zinc-900">No match found</p>
            <p className="mt-1 text-sm text-zinc-500">Create it as a new {lower(v.ingredient)}, or search your {lower(v.ingredients)} below.</p>
          </>
        )}
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          disabled={disabled}
          onClick={() => finish("left")}
          className="flex-1 rounded-full border border-red-300 py-2.5 text-sm font-medium text-red-600 disabled:opacity-50"
        >
          {leftLabel}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => finish("right")}
          className="flex-1 rounded-full bg-green-600 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {rightLabel}
        </button>
      </div>
    </div>
  );
}
