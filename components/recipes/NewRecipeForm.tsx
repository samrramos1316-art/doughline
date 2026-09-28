"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function NewRecipeForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const body = {
      name: formData.get("name"),
      batch_yield_qty: formData.get("batch_yield_qty"),
      batch_yield_unit: formData.get("batch_yield_unit"),
    };

    const res = await fetch("/api/recipes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setPending(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Something went wrong");
      return;
    }
    const { recipe } = await res.json();
    router.push(`/recipes/${recipe.id}`);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap items-end gap-2 rounded-lg border border-zinc-200 bg-white p-4"
    >
      {error && <p className="w-full text-sm text-red-600">{error}</p>}

      <div className="flex flex-col gap-1">
        <label htmlFor="recipe-name" className="text-xs font-medium text-zinc-600">Name</label>
        <input id="recipe-name" name="name" required className="rounded-md border border-zinc-300 px-2 py-1 text-sm" />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="recipe-batch-yield-qty" className="text-xs font-medium text-zinc-600">Batch yield qty</label>
        <input
          id="recipe-batch-yield-qty"
          name="batch_yield_qty"
          type="number"
          step="0.0001"
          required
          className="w-28 rounded-md border border-zinc-300 px-2 py-1 text-sm"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="recipe-batch-yield-unit" className="text-xs font-medium text-zinc-600">Batch yield unit</label>
        <input
          id="recipe-batch-yield-unit"
          name="batch_yield_unit"
          required
          placeholder="servings"
          className="w-28 rounded-md border border-zinc-300 px-2 py-1 text-sm"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "Creating…" : "Create recipe"}
      </button>
    </form>
  );
}
