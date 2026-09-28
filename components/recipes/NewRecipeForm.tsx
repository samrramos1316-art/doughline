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
      className="flex flex-col gap-3"
    >
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-col gap-1">
        <label htmlFor="recipe-name" className="text-[11px] font-semibold tracking-wider text-stone-500 uppercase">Name</label>
        <input id="recipe-name" name="name" required className="w-full rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-sm text-stone-900 shadow-sm outline-none focus:border-stone-500 focus:ring-2 focus:ring-amber-200" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="recipe-batch-yield-qty" className="text-[11px] font-semibold tracking-wider text-stone-500 uppercase">Batch makes</label>
          <input
            id="recipe-batch-yield-qty"
            name="batch_yield_qty"
            type="number"
            step="0.0001"
            required
            className="w-full rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-sm text-stone-900 shadow-sm outline-none focus:border-stone-500 focus:ring-2 focus:ring-amber-200"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="recipe-batch-yield-unit" className="text-[11px] font-semibold tracking-wider text-stone-500 uppercase">Of what</label>
          <input
            id="recipe-batch-yield-unit"
            name="batch_yield_unit"
            required
            placeholder="e.g. cookies"
            className="w-full rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-sm text-stone-900 shadow-sm outline-none focus:border-stone-500 focus:ring-2 focus:ring-amber-200"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-stone-900 px-3 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
      >
        {pending ? "Creating…" : "Create recipe"}
      </button>
    </form>
  );
}
