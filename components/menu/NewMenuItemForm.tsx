"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function NewMenuItemForm({ recipeOptions }: { recipeOptions: { id: string; name: string }[] }) {
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
      className="flex flex-wrap items-end gap-2 rounded-lg border border-zinc-200 bg-white p-4"
    >
      {error && <p className="w-full text-sm text-red-600">{error}</p>}

      <div className="flex flex-col gap-1">
        <label htmlFor="menu-name" className="text-xs font-medium text-zinc-600">Name</label>
        <input id="menu-name" name="name" required className="rounded-md border border-zinc-300 px-2 py-1 text-sm" />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="menu-recipe-id" className="text-xs font-medium text-zinc-600">Recipe</label>
        <select id="menu-recipe-id" name="recipe_id" className="rounded-md border border-zinc-300 px-2 py-1 text-sm">
          <option value="">—</option>
          {recipeOptions.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="menu-selling-price" className="text-xs font-medium text-zinc-600">Selling price</label>
        <input
          id="menu-selling-price"
          name="selling_price"
          type="number"
          step="0.01"
          required
          className="w-28 rounded-md border border-zinc-300 px-2 py-1 text-sm"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "Adding…" : "Add menu item"}
      </button>
    </form>
  );
}
