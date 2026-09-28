"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SwipeCard } from "./SwipeCard";
import { SUGGESTION_DISPLAY_THRESHOLD } from "@/lib/matching/thresholds";

type Candidate = { ingredient_id: string; name: string; similarity: number };

export type ReviewLineItem = {
  id: string;
  raw_text: string;
  item_name: string | null;
  parsed_quantity: number | null;
  parsed_unit: string | null;
  parsed_unit_cost: number | null;
  match_status: string;
  candidate_matches: Candidate[] | null;
  context?: string; // e.g. "Sysco · 7719-204583" in the org-wide queue
};

type IngredientOption = { id: string; name: string };
type NewIngredientForm = { name: string; base_unit: string; category: string };

const COMMON_UNITS = ["lb", "oz", "g", "kg", "each", "dozen", "gal", "qt", "ml", "l"];

async function postJson(path: string, body: unknown) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json;
}

// Candidates worth putting in front of the user. Display only: a line's
// match_status is set by routing (lib/matching/thresholds.ts) and doesn't
// change with what's shown; the rest stay in candidate_matches for tuning.
function visibleCandidates(li: ReviewLineItem | undefined) {
  if (!li || (li.match_status !== "needs_review" && li.match_status !== "new_ingredient")) return [];
  return (li.candidate_matches ?? []).filter((c) => c.similarity >= SUGGESTION_DISPLAY_THRESHOLD);
}

// §5.2 step 7: one card per unresolved line. Right = confirm the shown
// candidate; left = reject it and show the next one. With no candidate left
// (or none worth showing) the card says "No match found": right = create a
// new ingredient, left = skip for now, or search the ingredient list below.
// Every decision is written through the line-items API immediately.
export function SwipeDeck({
  lineItems,
  ingredients,
  doneHref,
  doneLabel,
}: {
  lineItems: ReviewLineItem[];
  ingredients: IngredientOption[];
  doneHref: string;
  doneLabel: string;
}) {
  const router = useRouter();
  const [queue, setQueue] = useState(lineItems);
  const [index, setIndex] = useState(0);
  const [cardVersion, setCardVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<NewIngredientForm | null>(null);
  const [tally, setTally] = useState({ confirmed: 0, created: 0, skipped: 0, ignored: 0 });

  const current = queue[index];
  const candidates = visibleCandidates(current);
  const shown = candidates[0] ?? null;
  const totalCandidates = visibleCandidates(lineItems.find((li) => li.id === current?.id)).length;

  function advance(kind: keyof typeof tally) {
    setTally((t) => ({ ...t, [kind]: t[kind] + 1 }));
    setIndex((i) => i + 1);
    setCardVersion((v) => v + 1);
    setForm(null);
    setError(null);
    if (index + 1 >= queue.length) router.refresh();
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setCardVersion((v) => v + 1); // bring the card back after its exit animation
    } finally {
      setBusy(false);
    }
  }

  function confirm(ingredientId: string) {
    return run(async () => {
      await postJson(`/api/line-items/${current.id}/confirm`, { ingredient_id: ingredientId });
      advance("confirmed");
    });
  }

  function handleSwipe(direction: "left" | "right") {
    if (!current) return;
    if (shown) {
      if (direction === "right") return confirm(shown.ingredient_id);
      return run(async () => {
        const { lineItem } = await postJson(`/api/line-items/${current.id}/reject`, {
          ingredient_id: shown.ingredient_id,
        });
        setQueue((q) =>
          q.map((li) =>
            li.id === current.id
              ? { ...li, match_status: lineItem.match_status, candidate_matches: lineItem.candidate_matches }
              : li,
          ),
        );
        setCardVersion((v) => v + 1);
      });
    }
    if (direction === "right") {
      setForm({ name: "", base_unit: "", category: "" });
      setCardVersion((v) => v + 1);
    } else {
      advance("skipped");
    }
  }

  // Gloves, sanitizer, deposits: resolve the line without an ingredient.
  function notAnIngredient() {
    return run(async () => {
      await postJson(`/api/line-items/${current.id}/not-ingredient`, {});
      advance("ignored");
    });
  }

  function createIngredient(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    return run(async () => {
      await postJson(`/api/line-items/${current.id}/create-ingredient`, {
        name: form.name,
        base_unit: form.base_unit,
        ...(form.category ? { category: form.category } : {}),
      });
      advance("created");
    });
  }

  if (!current) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center">
        <p className="text-lg font-medium text-zinc-900">All caught up</p>
        <p className="text-sm text-zinc-500">
          {tally.confirmed} confirmed · {tally.created} added as new
          {tally.ignored > 0 && ` · ${tally.ignored} not ingredients`} · {tally.skipped} skipped for now
        </p>
        <Link href={doneHref} className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white">
          {doneLabel}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-sm text-zinc-500">
        {index + 1} of {queue.length}
        {current.context ? ` · ${current.context}` : ""}
      </p>

      {form ? (
        <form
          onSubmit={createIngredient}
          className="flex w-full max-w-sm flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-6 shadow-lg"
        >
          <div>
            <p className="text-xs font-medium tracking-wide text-zinc-400 uppercase">New ingredient for</p>
            <p className="mt-1 font-medium text-zinc-900">{current.raw_text}</p>
          </div>
          <label className="flex flex-col gap-1 text-sm text-zinc-700">
            Ingredient name
            <input
              required
              autoFocus
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={current.item_name ? `e.g. ${current.item_name}` : "e.g. Pure Vanilla Extract"}
              className="rounded-lg border border-zinc-300 px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-zinc-700">
            Base unit (what you cost it in)
            <input
              required
              list="base-units"
              value={form.base_unit}
              onChange={(e) => setForm({ ...form, base_unit: e.target.value })}
              placeholder="e.g. oz"
              className="rounded-lg border border-zinc-300 px-3 py-2"
            />
            <datalist id="base-units">
              {COMMON_UNITS.map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
          </label>
          <label className="flex flex-col gap-1 text-sm text-zinc-700">
            Category (optional)
            <input
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              placeholder="e.g. dairy"
              className="rounded-lg border border-zinc-300 px-3 py-2"
            />
          </label>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setForm(null)}
              className="flex-1 rounded-full border border-zinc-300 py-2.5 text-sm font-medium text-zinc-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="flex-1 rounded-full bg-green-600 py-2.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy ? "Adding…" : "Add & match"}
            </button>
          </div>
        </form>
      ) : (
        <div className="relative h-80 w-full max-w-sm">
          <div
            aria-hidden
            className="absolute inset-0 translate-y-2 scale-[0.97] rounded-2xl border border-zinc-200 bg-white opacity-60"
          />
          <SwipeCard
            key={`${current.id}-${cardVersion}`}
            rawText={current.raw_text}
            itemName={current.item_name}
            parsedQuantity={current.parsed_quantity}
            parsedUnit={current.parsed_unit}
            parsedUnitCost={current.parsed_unit_cost}
            candidate={shown}
            candidatePosition={shown ? `${totalCandidates - candidates.length + 1} of ${totalCandidates}` : undefined}
            lowConfidence={current.match_status === "new_ingredient"}
            leftLabel={shown ? "Not this" : "Skip for now"}
            rightLabel={shown ? "Confirm" : "Create new"}
            disabled={busy}
            onSwipe={handleSwipe}
          />
        </div>
      )}

      {error && <p className="text-sm font-medium text-red-600">{error}</p>}

      {!form && (
        <label className="flex w-full max-w-sm flex-col gap-1 text-xs text-zinc-500">
          {shown ? "Not in the suggestions? Search your ingredients:" : "Or search your ingredients:"}
          <select
            aria-label="Search your ingredients"
            value=""
            disabled={busy}
            onChange={(e) => e.target.value && confirm(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800"
          >
            <option value="">Choose an ingredient…</option>
            {ingredients.map((ing) => (
              <option key={ing.id} value={ing.id}>
                {ing.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {!form && (
        <button
          type="button"
          onClick={notAnIngredient}
          disabled={busy}
          className="text-sm font-medium text-zinc-600 underline decoration-zinc-300 underline-offset-4 hover:text-zinc-900 disabled:opacity-50"
        >
          Not an ingredient (supplies, fees) — don&apos;t track it
        </button>
      )}

      <p className="text-xs text-zinc-400">Drag the card, or use the buttons</p>
    </div>
  );
}
