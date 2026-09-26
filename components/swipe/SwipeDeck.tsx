"use client";

import { useState } from "react";
import { SwipeCard } from "./SwipeCard";

type Candidate = { ingredient_id: string; name: string; similarity: number };
type LineItem = {
  id: string;
  raw_text: string;
  parsed_quantity: number | null;
  parsed_unit: string | null;
  parsed_unit_cost: number | null;
  candidate_matches: Candidate[] | null;
};

type Resolution = { lineItemId: string; result: "confirmed" | "new_ingredient"; ingredientName: string | null };

export function SwipeDeck({ lineItems }: { lineItems: LineItem[] }) {
  const [queueIndex, setQueueIndex] = useState(0);
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [resolutions, setResolutions] = useState<Resolution[]>([]);

  const current = lineItems[queueIndex];
  const candidates = current?.candidate_matches ?? [];
  const currentCandidate = candidates[candidateIndex] ?? null;

  function advance(resolution: Resolution) {
    setResolutions((r) => [...r, resolution]);
    setCandidateIndex(0);
    setQueueIndex((i) => i + 1);
  }

  function handleSwipe(direction: "left" | "right") {
    if (!current) return;

    if (direction === "right") {
      advance({
        lineItemId: current.id,
        result: currentCandidate ? "confirmed" : "new_ingredient",
        ingredientName: currentCandidate?.name ?? null,
      });
      return;
    }

    // Left ("skip"): try the next candidate for this same item (§5.2 step
    // 7) before giving up and offering to create a new ingredient.
    if (candidateIndex + 1 < candidates.length) {
      setCandidateIndex((i) => i + 1);
    } else {
      advance({ lineItemId: current.id, result: "new_ingredient", ingredientName: null });
    }
  }

  if (!current) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center">
        <p className="text-lg font-medium text-zinc-900">All caught up</p>
        <p className="text-sm text-zinc-500">
          {resolutions.length} item{resolutions.length === 1 ? "" : "s"} reviewed this session.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-sm text-zinc-500">
        {queueIndex + 1} of {lineItems.length}
      </p>

      <div className="relative h-80 w-full max-w-sm">
        <div
          aria-hidden
          className="absolute inset-0 translate-y-2 scale-[0.97] rounded-2xl border border-zinc-200 bg-white opacity-60"
        />
        <SwipeCard
          key={`${current.id}-${candidateIndex}`}
          rawText={current.raw_text}
          parsedQuantity={current.parsed_quantity}
          parsedUnit={current.parsed_unit}
          parsedUnitCost={current.parsed_unit_cost}
          candidate={currentCandidate}
          onSwipe={handleSwipe}
        />
      </div>

      <p className="text-xs text-zinc-400">Drag the card, or use the buttons</p>
    </div>
  );
}
