"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { compressImage } from "@/lib/media/compressImage";
import { canonicalUnit, conversionFactor } from "@/lib/costing/units";
import { LOCAL_DATE_HEADER, browserLocalDate } from "@/lib/dates/localDate";

type Ingredient = { id: string; name: string; base_unit: string };
type Recipe = { id: string; name: string; yieldQty: number | null; yieldUnit: string | null; ingredients: string[] };
type Kind = "menu" | "recipe";
// `path` is set once the file is in Storage (or when it arrives already
// uploaded, from the invoice scanner). `movedFrom`: it was dropped in the
// other box and read as what it really is. "invoice": it's a supplier
// invoice, offered "Read it as an invoice".
type FileItem = {
  key: string;
  name: string;
  file?: File;
  path?: string;
  kind: Kind;
  status: "ready" | "reading" | "done" | "failed" | "invoice" | "sending" | "sent";
  note?: string;
  movedFrom?: Kind;
  invoiceId?: string;
};

type Candidate = { ingredient_id: string; name: string; similarity: number };
type ApiLine = {
  raw_text: string;
  quantity_guess: number | null;
  unit_guess: string | null;
  item_name_guess: string | null;
  match_status: string;
  matched_ingredient_id: string | null;
  candidates: Candidate[];
  base_quantity: number | null;
  new_ingredient?: { name: string; unit: string; quantity: number | null };
  note?: string; // the reasoning pass's why (lib/onboarding/reason.ts)
};
type LineDraft = {
  key: string;
  include: boolean;
  raw: string;
  qtyGuess: number | null;
  unitGuess: string | null;
  choice: string; // ingredient id, "new", or ""
  status: string; // how the matcher routed it
  candidates: Candidate[];
  qty: string;
  newName: string;
  newUnit: string;
  newCategory: string;
  note: string;
};
type RecipeDraft = { key: string; include: boolean; source: string; name: string; yieldQty: string; yieldUnit: string; lines: LineDraft[] };
// recipe: "", "id:<uuid>", "draft:<key>". servings: how many of this item one
// batch makes, when that differs from the recipe's own yield (a slice of a cake).
type MenuDraft = { key: string; include: boolean; name: string; price: string; recipe: string; servings: string; note: string };

const CATEGORIES = ["dairy", "dry_goods", "produce", "protein", "packaging", "beverage", "frozen"];
const cell = "w-full min-w-0 rounded border border-stone-300 bg-white px-2 py-1 text-[13px] text-stone-900 outline-none focus:border-stone-500 focus:ring-2 focus:ring-amber-200";
const th = "px-2 py-1.5 text-left text-[11px] font-semibold tracking-wider text-stone-500 uppercase whitespace-nowrap";
const newKey = () => crypto.randomUUID();
const round4 = (n: number) => Math.round(n * 10000) / 10000;
const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

// What a brand-new ingredient is costed in: weights in lb (converted), a bare
// count in each, anything else as the recipe wrote it (the owner can change it).
function newIngredientUnit(unitGuess: string | null, qty: number | null) {
  const u = canonicalUnit(unitGuess);
  if (!unitGuess) return { unit: "each", qty };
  const toLb = conversionFactor(u, "lb");
  if (toLb != null && qty != null) return { unit: "lb", qty: round4(qty * toLb) };
  return { unit: u ?? unitGuess.toLowerCase(), qty };
}

// The recipe quantity in a chosen ingredient's base unit, when the units allow it.
function qtyIn(base: string, qtyGuess: number | null, unitGuess: string | null) {
  if (qtyGuess == null) return "";
  if (!unitGuess) return base === "each" ? String(qtyGuess) : "";
  const f = conversionFactor(unitGuess, base);
  return f == null ? "" : String(round4(qtyGuess * f));
}

// Fallback when the linking call fails: best token overlap between a menu
// item and a recipe name ("Chocolate Chip Cookie" ↔ "Chocolate Chip Cookies").
const tokens = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((t) => t.length > 2).map((t) => t.replace(/(es|s)$/, "")));
function bestRecipe(name: string, options: { value: string; label: string }[]) {
  const t = tokens(name);
  let best = "", score = 0;
  for (const o of options) {
    const o2 = tokens(o.label);
    const s = [...t].filter((x) => o2.has(x)).length / Math.max(Math.min(t.size, o2.size), 1);
    if (s > score) { score = s; best = o.value; }
  }
  return score >= 0.6 ? best : "";
}

class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly body: Record<string, unknown>) {
    super(message);
  }
}

async function postJson(url: string, body: unknown, method = "POST") {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json", [LOCAL_DATE_HEADER]: browserLocalDate() }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(json.error ?? `Request failed (${res.status})`, res.status, json);
  return json;
}

// The reader said this upload is something else (import-menu / import-recipe 422).
const wrongKind = (err: unknown) => (err instanceof ApiError && err.body.wrong_kind ? (err.body.document_type as "invoice" | "menu" | "recipe" | "other") : null);
const KIND_WORD: Record<Kind, string> = { menu: "a menu", recipe: "a recipe" };

// §9.3: upload menus and recipes (photos or PDFs), let the vision model do
// the first pass, then confirm everything in one editable review screen —
// recipes (with each ingredient matched, or offered as a new ingredient)
// and menu items (with prices, linked to a recipe). Nothing is saved until
// "Save", and then only through the existing ingredient/recipe/menu APIs.
// `only` narrows the screen to one kind (Menu → "Import menu", Recipes →
// "Import recipes"); without it both drop zones show, as on first run.
// `preloaded`: files already in the onboarding folder (a menu or recipe the
// invoice scanner turned away) — read as soon as the screen opens.
export function OnboardingImport({
  orgId,
  ingredients,
  recipes,
  only,
  preloaded = [],
}: {
  orgId: string;
  ingredients: Ingredient[];
  recipes: Recipe[];
  only?: Kind;
  preloaded?: { path: string; kind: Kind }[];
}) {
  const router = useRouter();
  const [files, setFiles] = useState<FileItem[]>(() =>
    preloaded.map((p) => ({ key: newKey(), name: `The file from Invoices (${p.path.split(".").pop()?.toUpperCase()})`, path: p.path, kind: p.kind, status: "ready" as const })),
  );
  const [drafts, setDrafts] = useState<RecipeDraft[]>([]);
  const [menu, setMenu] = useState<MenuDraft[]>([]);
  const [phase, setPhase] = useState<"pick" | "reading" | "review" | "saving" | "done">("pick");
  const [error, setError] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [linking, setLinking] = useState(false);
  const [saved, setSaved] = useState<{ ingredients: number; recipes: number; menu: number } | null>(null);
  const ingById = new Map(ingredients.map((i) => [i.id, i]));
  const readyCount = files.filter((f) => f.status === "ready").length;

  function addFiles(list: FileList | null, kind: Kind) {
    if (!list) return;
    const accepted = Array.from(list).filter((f) => f.type.startsWith("image/") || f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
    setFiles((cur) => [...cur, ...accepted.map((file) => ({ key: newKey(), name: file.name, file, kind, status: "ready" as const }))].slice(0, 30));
  }

  async function upload(f: FileItem) {
    if (f.path) return f.path;
    const file = f.file!;
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    const path = `${orgId}/onboarding/${newKey()}.${isPdf ? "pdf" : "jpg"}`;
    const { error: upErr } = await createClient().storage.from("invoices").upload(path, isPdf ? file : await compressImage(file), { contentType: isPdf ? "application/pdf" : "image/jpeg" });
    if (upErr) throw new Error(upErr.message);
    return path;
  }

  async function readMenu(path: string): Promise<MenuDraft[]> {
    const { items } = await postJson("/api/onboarding/import-menu", { file_storage_path: path });
    return (items as { name_guess: string; price_guess: number | null }[]).map((it) => ({
      key: newKey(), include: true, name: it.name_guess, price: it.price_guess == null ? "" : String(it.price_guess), recipe: "", servings: "", note: "",
    }));
  }

  async function readRecipe(path: string, source: string): Promise<RecipeDraft> {
    const { recipe, lines } = await postJson("/api/onboarding/import-recipe", { file_storage_path: path });
    const draftLines: LineDraft[] = (lines as ApiLine[]).map((l) => {
      const matched = l.matched_ingredient_id && ingById.has(l.matched_ingredient_id) ? l.matched_ingredient_id : "";
      const fresh = l.new_ingredient
        ? { unit: l.new_ingredient.unit, qty: l.new_ingredient.quantity }
        : newIngredientUnit(l.unit_guess, l.quantity_guess);
      const free = l.match_status === "free"; // water: no cost, left out
      return {
        key: newKey(),
        include: !free,
        raw: l.raw_text,
        qtyGuess: l.quantity_guess,
        unitGuess: l.unit_guess,
        choice: free ? "" : matched || "new",
        status: free ? "free" : matched ? l.match_status : "new_ingredient",
        candidates: l.candidates,
        qty: free ? "" : matched ? (l.base_quantity == null ? "" : String(l.base_quantity)) : fresh.qty == null ? "" : String(fresh.qty),
        newName: l.new_ingredient?.name ?? titleCase(l.item_name_guess ?? l.raw_text),
        newUnit: fresh.unit,
        newCategory: "",
        note: l.note ?? "",
      };
    });
    return {
      key: newKey(),
      include: true,
      source,
      name: recipe.name_guess ?? source.replace(/\.[^.]+$/, ""),
      yieldQty: recipe.yield_qty_guess == null ? "" : String(recipe.yield_qty_guess),
      yieldUnit: recipe.yield_unit_guess ?? "servings",
      lines: draftLines,
    };
  }

  const patchFile = (key: string, patch: Partial<FileItem>) => setFiles((cur) => cur.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  async function readAll() {
    setPhase("reading");
    setError(null);
    const newDrafts: RecipeDraft[] = [];
    const newMenu: MenuDraft[] = [];
    for (const f of files.filter((x) => x.status === "ready")) {
      patchFile(f.key, { status: "reading" });
      try {
        const path = await upload(f);
        patchFile(f.key, { path });
        // Read it as what it was dropped in as; if the reader says it's the
        // other kind, read it again as that and say so.
        let kind = f.kind;
        let movedFrom: Kind | undefined;
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            if (kind === "menu") {
              const items = await readMenu(path);
              newMenu.push(...items);
              patchFile(f.key, { kind, movedFrom, status: items.length ? "done" : "failed", note: items.length ? `${items.length} items` : "No items found — add them below by hand" });
            } else {
              const draft = await readRecipe(path, f.name);
              newDrafts.push(draft);
              patchFile(f.key, { kind, movedFrom, status: draft.lines.length ? "done" : "failed", note: draft.lines.length ? `${draft.name} · ${draft.lines.length} ingredients` : "No ingredients found" });
            }
            break;
          } catch (err) {
            const actual = wrongKind(err);
            if ((actual === "menu" || actual === "recipe") && attempt === 0) {
              movedFrom = kind;
              kind = actual;
              patchFile(f.key, { note: `This is ${KIND_WORD[actual]}, not ${KIND_WORD[movedFrom]} — reading it as ${KIND_WORD[actual]}…` });
              continue;
            }
            if (actual === "invoice") {
              patchFile(f.key, { status: "invoice", note: "This is a supplier invoice or receipt, not a menu or recipe." });
              break;
            }
            throw err;
          }
        }
      } catch (err) {
        patchFile(f.key, { status: "failed", note: err instanceof Error ? err.message : "Couldn't read it" });
      }
    }
    setDrafts((cur) => [...cur, ...newDrafts]);
    setMenu((cur) => [...cur, ...newMenu]);
    setPhase("review");
    await linkMenu(newMenu, [...drafts, ...newDrafts]);
  }

  // An invoice dropped here by mistake: make it an invoice from the same
  // upload and read it, without sending the owner to upload it again.
  async function sendToInvoices(f: FileItem) {
    if (!f.path) return;
    patchFile(f.key, { status: "sending", note: "Reading it as an invoice…" });
    const invoiceId = crypto.randomUUID();
    try {
      await postJson("/api/invoices", { id: invoiceId, file_storage_path: f.path, file_type: f.path.endsWith(".pdf") ? "pdf" : "image" });
      const res = await fetch(`/api/invoices/${invoiceId}/scan`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 502) throw new Error(body.error ?? "Couldn't read it as an invoice");
      patchFile(f.key, {
        status: "sent",
        invoiceId,
        note: body.status === "needs_review" ? "Added to Invoices — a few lines to check" : res.status === 502 || body.status === "failed" ? "Added to Invoices, but it couldn't be read — enter it by hand there" : "Added to Invoices",
      });
    } catch (err) {
      patchFile(f.key, { status: "invoice", note: err instanceof Error ? err.message : "Couldn't read it as an invoice" });
    }
  }

  // Suggest the recipe each new menu item is made from (and its portion),
  // across existing recipes and the ones just read. Falls back to name
  // overlap if the call fails.
  async function linkMenu(items: MenuDraft[], allDrafts: RecipeDraft[]) {
    const candidates = [
      ...recipes.map((r) => ({ key: `id:${r.id}`, name: r.name, yield_qty: r.yieldQty, yield_unit: r.yieldUnit, ingredients: r.ingredients.slice(0, 60) })),
      ...allDrafts.filter((d) => d.include).map((d) => ({
        key: `draft:${d.key}`,
        name: d.name,
        yield_qty: d.yieldQty !== "" && Number.isFinite(Number(d.yieldQty)) ? Number(d.yieldQty) : null,
        yield_unit: d.yieldUnit || null,
        ingredients: d.lines
          .filter((l) => l.include)
          .map((l) => (l.choice && l.choice !== "new" ? ingById.get(l.choice)?.name : l.newName) ?? l.raw)
          .slice(0, 60),
      })),
    ];
    if (!items.length || !candidates.length) return;
    setLinking(true);
    let patch: Map<string, Partial<MenuDraft>>;
    try {
      const { links } = await postJson("/api/onboarding/link-menu", {
        menu: items.map((m) => ({ key: m.key, name: m.name, price: m.price === "" ? null : Number(m.price) })),
        recipes: candidates,
      });
      patch = new Map(
        (links as { key: string; recipe_key: string | null; servings_per_batch: number | null; note: string }[]).map((l) => [
          l.key,
          { recipe: l.recipe_key ?? "", servings: l.servings_per_batch == null ? "" : String(l.servings_per_batch), note: l.note },
        ]),
      );
    } catch {
      const options = candidates.map((c) => ({ value: c.key, label: c.name }));
      patch = new Map(items.map((m) => [m.key, { recipe: bestRecipe(m.name, options) }]));
    }
    setMenu((cur) => cur.map((m) => (patch.has(m.key) ? { ...m, ...patch.get(m.key) } : m)));
    setLinking(false);
  }

  // A file handed over from the invoice scanner reads straight away.
  const autoRead = useRef(false);
  useEffect(() => {
    if (autoRead.current || !preloaded.length) return;
    autoRead.current = true;
    void readAll();
    // Once, on arrival; readAll reads the files state this render holds.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setDraft = (key: string, patch: Partial<RecipeDraft>) => setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  const setLine = (dKey: string, lKey: string, patch: Partial<LineDraft>) =>
    setDrafts((ds) => ds.map((d) => (d.key === dKey ? { ...d, lines: d.lines.map((l) => (l.key === lKey ? { ...l, ...patch } : l)) } : d)));
  const setRow = (key: string, patch: Partial<MenuDraft>) => setMenu((ms) => ms.map((m) => (m.key === key ? { ...m, ...patch } : m)));

  // ---- validation ----------------------------------------------------------
  const num = (s: string) => (s.trim() === "" ? NaN : Number(s.replace(/[$,]/g, "")));
  const lineError = (l: LineDraft) => {
    if (!l.include) return null;
    if (!l.choice) return "Pick an ingredient";
    if (l.choice === "new" && (!l.newName.trim() || !l.newUnit.trim())) return "Name and unit";
    if (!(num(l.qty) > 0)) return "Quantity";
    return null;
  };
  const recipeError = (d: RecipeDraft) =>
    !d.include ? null : !d.name.trim() ? "Name the recipe" : !(num(d.yieldQty) > 0) ? "How many does a batch make?" : d.lines.some(lineError) ? "Finish the highlighted lines" : null;
  const rowError = (m: MenuDraft) =>
    !m.include ? null : !m.name.trim() ? "Name" : !(num(m.price) >= 0) ? "Price" : m.servings.trim() !== "" && !(num(m.servings) > 0) ? "Servings" : null;
  const included = drafts.filter((d) => d.include);
  const includedMenu = menu.filter((m) => m.include);
  const problems = included.filter(recipeError).length + includedMenu.filter(rowError).length;

  async function save() {
    setShowErrors(true);
    if (problems) {
      setError(`Fix the ${problems} highlighted item${problems === 1 ? "" : "s"} first — nothing was saved.`);
      return;
    }
    setPhase("saving");
    setError(null);
    try {
      // 1. New ingredients, once each, in one batch (one embedding call).
      const wanted = new Map<string, { name: string; base_unit: string; category: string }>();
      for (const d of included) for (const l of d.lines) if (l.include && l.choice === "new") wanted.set(l.newName.trim().toLowerCase(), { name: l.newName.trim(), base_unit: l.newUnit.trim(), category: l.newCategory });
      const idByNewName = new Map<string, string>();
      if (wanted.size) {
        const res = await postJson("/api/ingredients/import", {
          rows: [...wanted.values()].map((w, i) => ({ row: i + 1, name: w.name, base_unit: w.base_unit, category: w.category || undefined })),
        });
        for (const o of res.outcomes as { id: string; name: string }[]) idByNewName.set(o.name.trim().toLowerCase(), o.id);
      }
      const unitOf = (l: LineDraft) => (l.choice === "new" ? l.newUnit.trim() : ingById.get(l.choice)?.base_unit ?? "each");

      // 2. Recipes, each with its ingredient rows.
      const recipeIdByDraft = new Map<string, string>();
      for (const d of included) {
        const merged = new Map<string, { ingredient_id: string; quantity: number; unit: string }>();
        for (const l of d.lines.filter((x) => x.include)) {
          const id = l.choice === "new" ? idByNewName.get(l.newName.trim().toLowerCase()) : l.choice;
          if (!id) throw new Error(`Couldn't create "${l.newName}"`);
          const prev = merged.get(id); // "butter" listed twice in one recipe
          merged.set(id, { ingredient_id: id, unit: unitOf(l), quantity: round4((prev?.quantity ?? 0) + num(l.qty)) });
        }
        const { recipe } = await postJson("/api/recipes", { name: d.name.trim(), batch_yield_qty: num(d.yieldQty), batch_yield_unit: d.yieldUnit.trim() || "servings", ingredients: [...merged.values()] });
        recipeIdByDraft.set(d.key, recipe.id);
      }

      // 3. Menu items, linked to an existing recipe or one just created.
      for (const m of includedMenu) {
        const recipe_id = m.recipe.startsWith("id:") ? m.recipe.slice(3) : m.recipe.startsWith("draft:") ? recipeIdByDraft.get(m.recipe.slice(6)) : undefined;
        const servings = num(m.servings);
        await postJson("/api/menu-items", {
          name: m.name.trim(),
          selling_price: num(m.price),
          ...(recipe_id ? { recipe_id } : {}),
          ...(recipe_id && servings > 0 ? { servings_per_batch: servings } : {}),
        });
      }
      setSaved({ ingredients: wanted.size, recipes: included.length, menu: includedMenu.length });
      setPhase("done");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Saving failed");
      setPhase("review");
    }
  }

  // ---- screens -------------------------------------------------------------
  if (phase === "done" && saved) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-white p-6">
        <p className="text-lg font-semibold text-stone-900">You&apos;re set up.</p>
        <p className="mt-1 text-sm text-stone-600">
          Added {saved.recipes} recipe{saved.recipes === 1 ? "" : "s"}, {saved.menu} menu item{saved.menu === 1 ? "" : "s"}
          {saved.ingredients ? ` and ${saved.ingredients} new ingredient${saved.ingredients === 1 ? "" : "s"}` : ""}.
          {saved.ingredients ? " New ingredients have no price yet — scan an invoice or add prices on Ingredients, and your margins fill in." : ""}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/dashboard" className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white">Go to Overview</Link>
          <Link href={only === "recipe" ? "/recipes" : "/menu"} className="rounded-md border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700">{only === "recipe" ? "Recipes" : "Menu"}</Link>
          <Link href="/margins" className="rounded-md border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700">Margins</Link>
          <Link href="/ingredients" className="rounded-md border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700">Add prices</Link>
          <button type="button" onClick={() => { setFiles([]); setDrafts([]); setMenu([]); setSaved(null); setShowErrors(false); setPhase("pick"); }} className="rounded-md px-4 py-2 text-sm font-medium text-stone-600 underline">
            Import more
          </button>
        </div>
      </div>
    );
  }

  // The recipe's own yield: what "per batch" means when left blank.
  const yieldOf = (value: string) => {
    if (value.startsWith("draft:")) {
      const d = drafts.find((x) => x.key === value.slice(6));
      return d?.yieldQty ? `${d.yieldQty} ${d.yieldUnit}` : "";
    }
    const r = recipes.find((x) => `id:${x.id}` === value);
    return r?.yieldQty != null ? `${r.yieldQty} ${r.yieldUnit ?? ""}`.trim() : "";
  };

  const recipeOptions = [
    ...drafts.filter((d) => d.include).map((d) => ({ value: `draft:${d.key}`, label: `${d.name || "Untitled"} (new)` })),
    ...recipes.map((r) => ({ value: `id:${r.id}`, label: r.name })),
  ];

  return (
    <div className="flex flex-col gap-4">
      {(phase === "pick" || phase === "reading") && (
        <>
          <div className={`grid gap-4 ${only ? "" : "md:grid-cols-2"}`}>
            {only !== "recipe" && <DropZone kind="menu" title="Your menu" hint="A photo of the board, a printed menu, or the PDF you print from." onFiles={addFiles} disabled={phase === "reading"} />}
            {only !== "menu" && <DropZone kind="recipe" title="Your recipes" hint="One recipe per photo or PDF — cards, notebook pages, docs. Add as many as you like." onFiles={addFiles} disabled={phase === "reading"} />}
          </div>
          {files.length > 0 && (
            <ul aria-label="Files to read" className="divide-y divide-stone-100 rounded-lg border border-stone-200 bg-white">
              {files.map((f) => (
                <li key={f.key} data-testid="onboarding-file" data-status={f.status} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-stone-900">{f.name}</span>
                    <span className="text-xs text-stone-500">{f.kind === "menu" ? "Menu" : "Recipe"}{f.note ? ` · ${f.note}` : ""}</span>
                  </span>
                  <span className={`shrink-0 text-xs font-semibold ${f.status === "failed" ? "text-red-600" : f.status === "done" ? "text-emerald-700" : f.status === "reading" ? "text-amber-700" : "text-stone-500"}`}>
                    {f.status === "ready" ? (
                      <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles((cur) => cur.filter((x) => x.key !== f.key))} className="text-stone-400 hover:text-stone-700">✕</button>
                    ) : f.status === "reading" ? "Reading…" : f.status === "done" ? "Read" : f.status === "invoice" || f.status === "sending" || f.status === "sent" ? "An invoice" : "Couldn't read"}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={readAll} disabled={phase === "reading" || !files.some((f) => f.status === "ready")} className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-40">
              {phase === "reading" ? "Reading your files…" : readyCount ? `Read ${readyCount} file${readyCount === 1 ? "" : "s"}` : "Read files"}
            </button>
            {phase === "pick" && (
              <button type="button" onClick={() => setPhase("review")} className="text-sm text-stone-600 underline">
                Or type them in here instead
              </button>
            )}
          </div>
        </>
      )}

      {(phase === "review" || phase === "saving") && (
        <>
          {files.some((f) => f.movedFrom || f.status === "invoice" || f.status === "sending" || f.status === "sent") && (
            <section aria-label="Uploaded to the wrong place" data-testid="wrong-place" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-950">
              <p className="font-semibold">Some files weren&apos;t what they were uploaded as</p>
              <ul className="mt-1.5 flex flex-col gap-1.5">
                {files.filter((f) => f.movedFrom).map((f) => (
                  <li key={f.key} data-testid="moved-file">
                    <b>{f.name}</b> was uploaded as {KIND_WORD[f.movedFrom!]}, but it&apos;s {KIND_WORD[f.kind]} — we read it as {KIND_WORD[f.kind]}{f.kind === "recipe" ? " (under Recipes below)" : " (under Menu items below)"}.
                  </li>
                ))}
                {files.filter((f) => f.status === "invoice" || f.status === "sending" || f.status === "sent").map((f) => (
                  <li key={f.key} data-testid="invoice-file" className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span><b>{f.name}</b>: {f.status === "invoice" ? "this is a supplier invoice or receipt, not a menu or recipe." : f.note}</span>
                    {f.status === "invoice" && (
                      <button type="button" onClick={() => sendToInvoices(f)} className="rounded-md bg-stone-900 px-3 py-1 text-xs font-semibold text-white hover:bg-stone-800">
                        Read it as an invoice
                      </button>
                    )}
                    {f.status === "sent" && f.invoiceId && (
                      <Link href={`/invoices/${f.invoiceId}`} className="text-xs font-semibold text-amber-800 underline">
                        Open it in Invoices →
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {files.some((f) => f.status === "failed") && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {files.filter((f) => f.status === "failed").map((f) => `${f.name}: ${f.note}`).join(" · ")}
            </p>
          )}

          {(only !== "menu" || drafts.length > 0) && (
          <section aria-label="Recipes to add" className="overflow-hidden rounded-lg border border-stone-200 bg-white">
            <header className="flex items-center justify-between border-b border-stone-200 bg-stone-50/80 px-3 py-2">
              <h2 className="text-[11px] font-semibold tracking-[0.12em] text-stone-600 uppercase">Recipes · {included.length}</h2>
              <button type="button" onClick={() => setDrafts((ds) => [...ds, { key: newKey(), include: true, source: "typed in", name: "", yieldQty: "", yieldUnit: "servings", lines: [] }])} className="text-xs font-medium text-amber-700">+ Add a recipe</button>
            </header>
            {drafts.length === 0 && <p className="px-3 py-4 text-sm text-stone-500">No recipes read. Add one above, or skip — you can build recipes any time.</p>}
            {drafts.map((d) => {
              const err = showErrors ? recipeError(d) : null;
              return (
                <div key={d.key} data-testid="recipe-draft" className={`border-t border-stone-100 px-3 py-3 first:border-t-0 ${d.include ? "" : "opacity-50"}`}>
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="flex items-center gap-1.5 self-center text-xs text-stone-600">
                      <input type="checkbox" checked={d.include} onChange={(e) => setDraft(d.key, { include: e.target.checked })} aria-label={`Include ${d.name || "recipe"}`} /> Add
                    </label>
                    <label className="flex min-w-48 flex-1 flex-col gap-0.5 text-[11px] font-semibold tracking-wider text-stone-500 uppercase">
                      Recipe name
                      <input className={cell} value={d.name} onChange={(e) => setDraft(d.key, { name: e.target.value })} />
                    </label>
                    <label className="flex w-24 flex-col gap-0.5 text-[11px] font-semibold tracking-wider text-stone-500 uppercase">
                      Batch makes
                      <input className={cell} inputMode="decimal" value={d.yieldQty} onChange={(e) => setDraft(d.key, { yieldQty: e.target.value })} />
                    </label>
                    <label className="flex w-32 flex-col gap-0.5 text-[11px] font-semibold tracking-wider text-stone-500 uppercase">
                      Of what
                      <input className={cell} value={d.yieldUnit} onChange={(e) => setDraft(d.key, { yieldUnit: e.target.value })} />
                    </label>
                    <span className="self-center text-xs text-stone-400">from {d.source}</span>
                  </div>
                  {err && <p role="alert" className="mt-1 text-xs font-medium text-red-600">{err}</p>}
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full min-w-[720px]">
                      <thead>
                        <tr>
                          <th className={`${th} w-8`} />
                          <th className={th}>As written</th>
                          <th className={th}>Ingredient</th>
                          <th className={`${th} w-28 text-right`}>Qty per batch</th>
                          <th className={`${th} w-28`}>Unit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.lines.map((l) => {
                          const lerr = showErrors ? lineError(l) : null;
                          const base = l.choice && l.choice !== "new" ? ingById.get(l.choice)?.base_unit : null;
                          return (
                            <tr key={l.key} data-testid="recipe-line" className={`border-t border-stone-100 align-top ${l.include ? "" : "opacity-50"}`}>
                              <td className="px-2 py-1.5">
                                <input type="checkbox" checked={l.include} onChange={(e) => setLine(d.key, l.key, { include: e.target.checked })} aria-label={`Include ${l.raw}`} />
                              </td>
                              <td className="px-2 py-1.5 text-[13px] text-stone-800">
                                {l.raw}
                                <span className={`ml-1.5 rounded px-1 text-[10px] font-semibold ${l.status === "free" ? "bg-stone-100 text-stone-600" : l.choice === "new" ? "bg-orange-50 text-orange-700" : l.status === "auto_matched" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                                  {l.status === "free" ? "No cost" : l.choice === "new" ? "New ingredient?" : l.status === "auto_matched" ? "Matched" : "Check"}
                                </span>
                                {l.note && <span data-testid="line-note" className="mt-0.5 block text-[11px] text-stone-500">{l.note}</span>}
                              </td>
                              <td className="px-2 py-1.5">
                                <select
                                  aria-label={`Ingredient for ${l.raw}`}
                                  className={`${cell} ${lerr === "Pick an ingredient" ? "border-red-400" : ""}`}
                                  value={l.choice}
                                  onChange={(e) => {
                                    const choice = e.target.value;
                                    const b = ingById.get(choice)?.base_unit;
                                    setLine(d.key, l.key, { choice, status: choice === "new" ? "new_ingredient" : "confirmed", qty: choice === "new" ? String(newIngredientUnit(l.unitGuess, l.qtyGuess).qty ?? "") : b ? qtyIn(b, l.qtyGuess, l.unitGuess) : "" });
                                  }}
                                >
                                  <option value="">Choose…</option>
                                  <option value="new">➕ New ingredient</option>
                                  {l.candidates.length > 0 && (
                                    <optgroup label="Suggested">
                                      {l.candidates.map((c) => (
                                        <option key={`s-${c.ingredient_id}`} value={c.ingredient_id}>{c.name} ({Math.round(c.similarity * 100)}%)</option>
                                      ))}
                                    </optgroup>
                                  )}
                                  <optgroup label="All ingredients">
                                    {ingredients.map((i) => (
                                      <option key={i.id} value={i.id}>{i.name}</option>
                                    ))}
                                  </optgroup>
                                </select>
                                {l.choice === "new" && (
                                  <div className="mt-1 grid grid-cols-[minmax(0,1fr)_110px] gap-1">
                                    <input aria-label={`New ingredient name for ${l.raw}`} className={cell} value={l.newName} onChange={(e) => setLine(d.key, l.key, { newName: e.target.value })} placeholder="Name" />
                                    <select aria-label={`Category for ${l.raw}`} className={cell} value={l.newCategory} onChange={(e) => setLine(d.key, l.key, { newCategory: e.target.value })}>
                                      <option value="">Category…</option>
                                      {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace("_", " ")}</option>)}
                                    </select>
                                  </div>
                                )}
                              </td>
                              <td className="px-2 py-1.5">
                                <input aria-label={`Quantity for ${l.raw}`} inputMode="decimal" className={`${cell} text-right tabular-nums ${lerr === "Quantity" ? "border-red-400 bg-red-50" : ""}`} value={l.qty} onChange={(e) => setLine(d.key, l.key, { qty: e.target.value })} />
                                {l.qty === "" && l.qtyGuess != null && (
                                  <span className="mt-0.5 block text-[11px] text-amber-700">
                                    Recipe says {l.qtyGuess} {l.unitGuess ?? ""} — enter in {base ?? l.newUnit}
                                  </span>
                                )}
                              </td>
                              <td className="px-2 py-1.5">
                                {l.choice === "new" ? (
                                  <input aria-label={`Unit for new ingredient ${l.raw}`} className={cell} value={l.newUnit} onChange={(e) => setLine(d.key, l.key, { newUnit: e.target.value })} list="onboarding-units" />
                                ) : (
                                  <span className="block px-2 py-1 text-[13px] text-stone-500">{base ?? "—"}</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <button type="button" onClick={() => setDraft(d.key, { lines: [...d.lines, { key: newKey(), include: true, raw: "(added)", qtyGuess: null, unitGuess: null, choice: "", status: "confirmed", candidates: [], qty: "", newName: "", newUnit: "lb", newCategory: "", note: "" }] })} className="mt-1 text-xs font-medium text-amber-700">
                      + Add an ingredient line
                    </button>
                  </div>
                </div>
              );
            })}
            <datalist id="onboarding-units">
              {["lb", "oz", "kg", "g", "each", "dozen", "gal", "qt", "l", "ml", "cup", "tbsp", "tsp"].map((u) => <option key={u} value={u} />)}
            </datalist>
          </section>
          )}

          {(only !== "recipe" || menu.length > 0) && (
          <section aria-label="Menu items to add" className="overflow-hidden rounded-lg border border-stone-200 bg-white">
            <header className="flex items-center justify-between border-b border-stone-200 bg-stone-50/80 px-3 py-2">
              <h2 className="text-[11px] font-semibold tracking-[0.12em] text-stone-600 uppercase">
                Menu items · {includedMenu.length}
                {linking && <span className="ml-2 font-normal tracking-normal text-amber-700 normal-case">matching to recipes…</span>}
              </h2>
              <button type="button" onClick={() => setMenu((ms) => [...ms, { key: newKey(), include: true, name: "", price: "", recipe: "", servings: "", note: "" }])} className="text-xs font-medium text-amber-700">+ Add a menu item</button>
            </header>
            {menu.length === 0 ? (
              <p className="px-3 py-4 text-sm text-stone-500">No menu items read. Add them above, or skip — you can add them on Menu any time.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px]">
                  <thead>
                    <tr>
                      <th className={`${th} w-8`} />
                      <th className={th}>Name</th>
                      <th className={`${th} w-28 text-right`}>Price</th>
                      <th className={th}>Made from recipe</th>
                      <th className={`${th} w-32 text-right`}>Per batch</th>
                    </tr>
                  </thead>
                  <tbody>
                    {menu.map((m) => {
                      const err = showErrors ? rowError(m) : null;
                      return (
                        <tr key={m.key} data-testid="menu-draft" className={`border-t border-stone-100 ${m.include ? "" : "opacity-50"}`}>
                          <td className="px-2 py-1.5"><input type="checkbox" checked={m.include} onChange={(e) => setRow(m.key, { include: e.target.checked })} aria-label={`Include ${m.name}`} /></td>
                          <td className="px-2 py-1.5"><input aria-label="Menu item name" className={`${cell} ${err === "Name" ? "border-red-400 bg-red-50" : ""}`} value={m.name} onChange={(e) => setRow(m.key, { name: e.target.value })} /></td>
                          <td className="px-2 py-1.5"><input aria-label={`Price for ${m.name}`} inputMode="decimal" className={`${cell} text-right tabular-nums ${err === "Price" ? "border-red-400 bg-red-50" : ""}`} value={m.price} onChange={(e) => setRow(m.key, { price: e.target.value })} /></td>
                          <td className="px-2 py-1.5">
                            <select aria-label={`Recipe for ${m.name}`} className={cell} value={m.recipe} onChange={(e) => setRow(m.key, { recipe: e.target.value, note: "" })}>
                              <option value="">No recipe yet</option>
                              {recipeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                            {m.note && <span data-testid="menu-note" className="mt-0.5 block text-[11px] text-stone-500">{m.note}</span>}
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              aria-label={`Servings per batch for ${m.name}`}
                              inputMode="decimal"
                              disabled={!m.recipe}
                              className={`${cell} text-right tabular-nums disabled:bg-stone-50 ${err === "Servings" ? "border-red-400 bg-red-50" : ""}`}
                              value={m.servings}
                              placeholder={yieldOf(m.recipe)}
                              onChange={(e) => setRow(m.key, { servings: e.target.value })}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={save} disabled={phase === "saving" || linking || (!included.length && !includedMenu.length)} className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-40">
              {phase === "saving" ? "Saving…" : `Save ${[only !== "menu" || included.length ? `${included.length} recipe${included.length === 1 ? "" : "s"}` : "", only !== "recipe" || includedMenu.length ? `${includedMenu.length} menu item${includedMenu.length === 1 ? "" : "s"}` : ""].filter(Boolean).join(" and ")}`}
            </button>
            <button type="button" onClick={() => setPhase("pick")} disabled={phase === "saving"} className="text-sm text-stone-600 underline">
              Add more files
            </button>
            {error && <p role="alert" className="text-sm font-medium text-red-600">{error}</p>}
          </div>
        </>
      )}
    </div>
  );
}

function DropZone({ kind, title, hint, onFiles, disabled }: { kind: Kind; title: string; hint: string; onFiles: (f: FileList | null, k: Kind) => void; disabled: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const cam = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      data-testid={`drop-${kind}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); if (!disabled) onFiles(e.dataTransfer.files, kind); }}
      className={`flex flex-col items-center gap-2 rounded-xl border-2 border-dashed px-5 py-10 text-center transition ${over ? "border-amber-500 bg-amber-50" : "border-amber-300 bg-amber-50/40 hover:border-amber-400"}`}
    >
      <span aria-hidden className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-400 text-stone-900">
        <svg viewBox="0 0 24 24" className="h-6 w-6">
          <path d="M4 8a2 2 0 0 1 2-2h1.2a1 1 0 0 0 .8-.4l1-1.3A1 1 0 0 1 9.8 4h4.4a1 1 0 0 1 .8.3l1 1.3a1 1 0 0 0 .8.4H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Z" fill="none" stroke="currentColor" strokeWidth="2" />
          <circle cx="12" cy="13" r="3.5" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      </span>
      <p className="text-base font-semibold text-stone-900">{title}</p>
      <p className="max-w-xs text-sm text-stone-600">{hint}</p>
      <p className="hidden text-xs text-stone-500 md:block">Drag files here, or</p>
      <input ref={ref} type="file" multiple accept="image/*,application/pdf" aria-label={`Choose ${kind === "menu" ? "menu" : "recipe"} files`} className="sr-only" onChange={(e) => { onFiles(e.target.files, kind); e.target.value = ""; }} />
      <input ref={cam} type="file" accept="image/*" capture="environment" aria-label={`Take a photo of your ${kind}`} className="sr-only" onChange={(e) => { onFiles(e.target.files, kind); e.target.value = ""; }} />
      <div className="mt-1 flex flex-wrap justify-center gap-2">
        <button type="button" disabled={disabled} onClick={() => cam.current?.click()} className="rounded-md bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-800 disabled:opacity-40 md:hidden">
          Take a photo
        </button>
        <button type="button" disabled={disabled} onClick={() => ref.current?.click()} className="rounded-md border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-800 hover:border-stone-400 disabled:opacity-40">
          Choose files
        </button>
      </div>
    </div>
  );
}
