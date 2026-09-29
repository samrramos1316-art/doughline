"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Item = { id: string; name: string; price: number; recipeId: string | null; servings: number | null; isActive: boolean };

const field = "w-full rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-sm text-stone-900 shadow-sm outline-none focus:border-stone-500 focus:ring-2 focus:ring-amber-200";
const label = "text-[11px] font-semibold tracking-wider text-stone-500 uppercase";

// Fix a menu item after the fact: the price, the recipe it's made from (or
// link one after an import left it unlinked), how many servings a batch
// makes, taking it off the menu, or deleting it.
export function EditMenuItem({ item, recipeOptions }: { item: Item; recipeOptions: { id: string; name: string; yieldQty: number | null; yieldUnit: string | null }[] }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recipeId, setRecipeId] = useState(item.recipeId ?? "");
  const recipe = recipeOptions.find((r) => r.id === recipeId);

  async function send(method: "PATCH" | "DELETE", body?: unknown) {
    setPending(true);
    setError(null);
    const res = await fetch(`/api/menu-items/${item.id}`, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    setPending(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Couldn't save that");
      return;
    }
    dialog.current?.close();
    router.refresh();
  }

  function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const servings = String(f.get("servings") ?? "").trim();
    send("PATCH", {
      name: String(f.get("name")).trim(),
      selling_price: f.get("price"),
      recipe_id: recipeId || null,
      servings_per_batch: servings ? servings : null,
      is_active: f.get("active") === "on",
    });
  }

  return (
    <>
      <button type="button" onClick={() => { setRecipeId(item.recipeId ?? ""); setError(null); dialog.current?.showModal(); }} className="text-xs font-medium text-amber-700 hover:underline" aria-label={`Edit ${item.name}`}>
        Edit
      </button>
      <dialog ref={dialog} aria-label={`Edit ${item.name}`} className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-lg border border-stone-200 p-0 shadow-xl backdrop:bg-stone-900/40">
        <form onSubmit={save} className="flex flex-col gap-3 p-4 text-left whitespace-normal">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-stone-900">Edit menu item</h2>
            <button type="button" onClick={() => dialog.current?.close()} className="text-stone-400 hover:text-stone-700" aria-label="Close">✕</button>
          </div>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <label className="flex flex-col gap-1">
            <span className={label}>Name</span>
            <input name="name" required defaultValue={item.name} className={field} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={label}>Selling price</span>
            <input name="price" type="number" step="0.01" min="0" required defaultValue={item.price} className={field} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={label}>Made from recipe</span>
            <select name="recipe" value={recipeId} onChange={(e) => setRecipeId(e.target.value)} className={field}>
              <option value="">— no recipe (no cost) —</option>
              {recipeOptions.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={label}>Servings per batch</span>
            <input
              name="servings"
              type="number"
              step="any"
              min="0"
              defaultValue={item.servings ?? ""}
              placeholder={recipe?.yieldQty != null ? `${recipe.yieldQty} (the recipe's yield)` : "the recipe's yield"}
              className={field}
              disabled={!recipeId}
            />
            <span className="text-xs text-stone-500">
              Leave blank when one batch makes {recipe?.yieldQty != null ? `${recipe.yieldQty} ${recipe.yieldUnit ?? ""}`.trim() : "the recipe's yield"} of these. Set it when it differs — a cake cut into 12 slices is 12.
            </span>
          </label>
          <label className="flex items-center gap-2 text-sm text-stone-700">
            <input name="active" type="checkbox" defaultChecked={item.isActive} className="h-4 w-4 accent-stone-900" /> On the menu
          </label>
          <div className="mt-1 flex items-center justify-between gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => { if (window.confirm(`Delete ${item.name}? This can't be undone.`)) send("DELETE"); }}
              className="text-sm font-medium text-red-600 hover:underline disabled:opacity-50"
            >
              Delete
            </button>
            <div className="flex gap-2">
              <button type="button" onClick={() => dialog.current?.close()} className="rounded-md border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-700">Cancel</button>
              <button type="submit" disabled={pending} className="rounded-md bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50">
                {pending ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </form>
      </dialog>
    </>
  );
}
