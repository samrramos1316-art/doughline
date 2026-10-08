import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";
import { OnboardingImport } from "@/components/onboarding/OnboardingImport";
import { getIndustry } from "@/lib/supabase/vocab";
import { formSuggestions } from "@/lib/industries";
import { lower, type Vocab } from "@/lib/vocab";
import { PageHeader } from "@/components/ui/dash";
import { ONBOARDING_FOLDER } from "@/lib/onboarding/upload";

// §9.3: shown once right after signup (the signup action lands here with
// ?welcome=1, both kinds at once), and any time after from Add from a photo,
// Menu and Recipes with ?kind=menu or ?kind=recipe — one kind per screen.
// A suggestion, never a gate: Skip goes straight to manual entry. Worded
// for the business's industry (lib/industries).
const copyFor = (v: Vocab) => ({
  menu: { title: `Import your ${lower(v.menu)}`, subtitle: `A photo or PDF of your ${lower(v.menu)}. We read each item and its price, link it to the ${lower(v.recipe)} it's made from, and you check it before anything is saved.`, back: "/menu" },
  recipe: { title: `Import ${lower(v.recipes)}`, subtitle: `Photos or PDFs of your ${lower(v.recipes)}, one per file. We read the ${lower(v.ingredients)} and amounts and match them to your price list; you check them before anything is saved.`, back: "/recipes" },
});

export default async function OnboardingImportPage({ searchParams }: { searchParams: Promise<{ welcome?: string; kind?: string; file?: string | string[] }> }) {
  const { welcome, kind: kindParam, file } = await searchParams;
  const kind: "menu" | "recipe" | undefined = !welcome && (kindParam === "menu" || kindParam === "recipe") ? kindParam : undefined;
  const supabase = await createClient();
  const orgId = await getCurrentOrgId(supabase);
  if (!orgId) redirect("/login");
  // ?file=: a menu or recipe the invoice scanner turned away, already in this
  // org's onboarding folder — read it straight away as `kind`.
  const handedOver = kind
    ? [file ?? []].flat().filter((p) => p.startsWith(`${orgId}/${ONBOARDING_FOLDER}/`) && !p.includes("..")).map((path) => ({ path, kind }))
    : [];
  const [{ data: ingredients }, { data: recipes }, { data: org }, industry] = await Promise.all([
    supabase.from("ingredients").select("id, name, base_unit").order("name"),
    supabase.from("recipes").select("id, name, batch_yield_qty, batch_yield_unit, recipe_ingredients(ingredients(name))").order("name"),
    supabase.from("organizations").select("name").eq("id", orgId).single(),
    getIndustry(),
  ]);
  const v = industry.vocab;
  const COPY = copyFor(v);

  return (
    <>
      <PageHeader
        title={welcome ? `Welcome, ${org?.name ?? "let's get you set up"}` : kind ? COPY[kind].title : `Import ${lower(v.menu)} & ${lower(v.recipes)}`}
        subtitle={
          welcome
            ? `Upload your ${lower(v.menu)} and ${lower(v.recipes)} to get started fast — photos or PDFs. We read them, you check them, nothing is saved until you say so.`
            : kind
              ? COPY[kind].subtitle
              : `Photos or PDFs of your ${lower(v.menu)} and ${lower(v.recipes)}. We read them, you check them, nothing is saved until you say so.`
        }
        actions={
          <Link href={welcome ? "/recipes" : kind ? COPY[kind].back : "/add"} className="text-sm font-medium text-stone-600 underline underline-offset-2 hover:text-stone-900">
            {welcome ? "Skip — I'll enter these manually" : "Cancel"}
          </Link>
        }
      />
      {welcome && (
        <ol className="mb-4 grid gap-2 text-sm text-stone-600 sm:grid-cols-3">
          <li className="rounded-lg border border-stone-200 bg-white px-3 py-2"><b className="text-stone-900">1. Drop in your files.</b> The {lower(v.menu)} on one side, {lower(v.recipes)} on the other.</li>
          <li className="rounded-lg border border-stone-200 bg-white px-3 py-2"><b className="text-stone-900">2. Check what we read.</b> Fix names, prices and amounts; match each {lower(v.ingredient)}.</li>
          <li className="rounded-lg border border-stone-200 bg-white px-3 py-2"><b className="text-stone-900">3. Save.</b> Then scan an invoice and your margins fill in.</li>
        </ol>
      )}
      <OnboardingImport
        suggest={formSuggestions(industry)}
        key={`${kind ?? "both"}:${handedOver.map((h) => h.path).join(",")}`}
        only={kind}
        preloaded={handedOver}
        orgId={orgId}
        ingredients={ingredients ?? []}
        recipes={(recipes ?? []).map((r) => ({
          id: r.id,
          name: r.name,
          yieldQty: r.batch_yield_qty == null ? null : Number(r.batch_yield_qty),
          yieldUnit: r.batch_yield_unit,
          ingredients: r.recipe_ingredients.map((ri) => ri.ingredients?.name).filter((n): n is string => !!n),
        }))}
      />
    </>
  );
}
