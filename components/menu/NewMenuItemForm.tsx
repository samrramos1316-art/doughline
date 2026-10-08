"use client";

import { useState } from "react";
import { useVocab } from "@/components/app/VocabProvider";
import { lower } from "@/lib/vocab";
import { useRouter } from "next/navigation";

export function NewMenuItemForm({ recipeOptions }: { recipeOptions: { id: string; name: string }[] }) {
  const v = useVocab();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);

    // Keep the form element: React clears e.currentTarget once the handler
    // yields at the first await, so reading it after the fetch threw and the
    // new item never appeared in the list (it was saved, though).
    const form = e.currentTarget;
    const formData = new FormData(form);
    const body = {
      name: formData.get("name"),
      recipe_id: formData.get("recipe_id") || undefined,
      selling_price: formData.get("selling_price"),
    };

    const res = await fetch("/api/menu-items", {
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
    form.reset();
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3"
    >
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-col gap-1">
        <label htmlFor="menu-name" className="text-[11px] font-semibold tracking-wider text-stone-500 uppercase">Name</label>
        <input id="menu-name" name="name" required className="w-full rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-sm text-stone-900 shadow-sm outline-none focus:border-stone-500 focus:ring-2 focus:ring-amber-200" />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="menu-recipe-id" className="text-[11px] font-semibold tracking-wider text-stone-500 uppercase">{v.recipe}</label>
        <select id="menu-recipe-id" name="recipe_id" className="w-full rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-sm text-stone-900 shadow-sm outline-none focus:border-stone-500 focus:ring-2 focus:ring-amber-200">
          <option value="">—</option>
          {recipeOptions.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="menu-selling-price" className="text-[11px] font-semibold tracking-wider text-stone-500 uppercase">Selling price</label>
        <input
          id="menu-selling-price"
          name="selling_price"
          type="number"
          step="0.01"
          required
          className="w-full rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-sm text-stone-900 shadow-sm outline-none focus:border-stone-500 focus:ring-2 focus:ring-amber-200"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-stone-900 px-3 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
      >
        {pending ? "Adding…" : `Add ${lower(v.menuItem)}`}
      </button>
    </form>
  );
}
