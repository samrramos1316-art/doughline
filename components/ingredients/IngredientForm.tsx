"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function IngredientForm() {
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
      category: formData.get("category") || undefined,
      base_unit: formData.get("base_unit"),
      current_unit_cost: formData.get("current_unit_cost") || undefined,
    };

    const res = await fetch("/api/ingredients", {
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
    e.currentTarget.reset();
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap items-end gap-2 rounded-lg border border-zinc-200 bg-white p-4"
    >
      {error && <p className="w-full text-sm text-red-600">{error}</p>}

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-zinc-600">Name</label>
        <input name="name" required className="rounded-md border border-zinc-300 px-2 py-1 text-sm" />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-zinc-600">Category</label>
        <input name="category" className="rounded-md border border-zinc-300 px-2 py-1 text-sm" />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-zinc-600">Base unit</label>
        <input
          name="base_unit"
          required
          placeholder="g"
          className="w-20 rounded-md border border-zinc-300 px-2 py-1 text-sm"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-zinc-600">Unit cost</label>
        <input
          name="current_unit_cost"
          type="number"
          step="0.0001"
          className="w-28 rounded-md border border-zinc-300 px-2 py-1 text-sm"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "Adding…" : "Add ingredient"}
      </button>
    </form>
  );
}
