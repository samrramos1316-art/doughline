import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";
import { OnboardingImport } from "@/components/onboarding/OnboardingImport";
import { PageHeader } from "@/components/ui/dash";

// §9.3: shown once right after signup (the signup action lands here with
// ?welcome=1), and reachable any time after from Recipes and Menu ("Import
// from photo"). A suggestion, never a gate: Skip goes straight to manual entry.
export default async function OnboardingImportPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const { welcome } = await searchParams;
  const supabase = await createClient();
  const orgId = await getCurrentOrgId(supabase);
  if (!orgId) redirect("/login");
  const [{ data: ingredients }, { data: recipes }, { data: org }] = await Promise.all([
    supabase.from("ingredients").select("id, name, base_unit").order("name"),
    supabase.from("recipes").select("id, name, batch_yield_qty, batch_yield_unit, recipe_ingredients(ingredients(name))").order("name"),
    supabase.from("organizations").select("name").eq("id", orgId).single(),
  ]);

  return (
    <>
      <PageHeader
        title={welcome ? `Welcome, ${org?.name ?? "let's get you set up"}` : "Import menu & recipes"}
        subtitle={
          welcome
            ? "Upload your menu and recipes to get started fast — photos or PDFs. We read them, you check them, nothing is saved until you say so."
            : "Photos or PDFs of your menu and recipes. We read them, you check them, nothing is saved until you say so."
        }
        actions={
          <Link href={welcome ? "/recipes" : "/dashboard"} className="text-sm font-medium text-stone-600 underline underline-offset-2 hover:text-stone-900">
            {welcome ? "Skip — I'll enter these manually" : "Cancel"}
          </Link>
        }
      />
      {welcome && (
        <ol className="mb-4 grid gap-2 text-sm text-stone-600 sm:grid-cols-3">
          <li className="rounded-lg border border-stone-200 bg-white px-3 py-2"><b className="text-stone-900">1. Drop in your files.</b> The menu on one side, recipes on the other.</li>
          <li className="rounded-lg border border-stone-200 bg-white px-3 py-2"><b className="text-stone-900">2. Check what we read.</b> Fix names, prices and amounts; match each ingredient.</li>
          <li className="rounded-lg border border-stone-200 bg-white px-3 py-2"><b className="text-stone-900">3. Save.</b> Then scan an invoice and your margins fill in.</li>
        </ol>
      )}
      <OnboardingImport
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
