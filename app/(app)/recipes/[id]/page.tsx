import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RecipeBuilder } from "@/components/recipes/RecipeBuilder";
import { CostBreakdown } from "@/components/recipes/CostBreakdown";
import { effectiveWastePct, laborOverheadOf, laborRate, lineCost, machineRate } from "@/lib/costing/recipeCost";
import { getVocab, getIndustry } from "@/lib/supabase/vocab";
import { isServiceCategory } from "@/lib/industries";
import { lower } from "@/lib/vocab";
import { Panel, Kpi, PageHeader, HBar, Empty, ButtonLink, money, unitMoney, th, thNum, td, tdNum, row } from "@/components/ui/dash";

export default async function RecipeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: recipe }, { data: recipeIngredients }, { data: allIngredients }, { data: cost }, { data: menu }, { data: org }, { data: menuItems }, v] = await Promise.all([
    supabase.from("recipes").select("*").eq("id", id).maybeSingle(),
    supabase.from("recipe_ingredients").select("ingredient_id, quantity, unit, waste_pct, ingredients(name, base_unit, current_unit_cost, waste_pct, category)").eq("recipe_id", id),
    supabase.from("ingredients").select("id, name, base_unit, waste_pct").order("name"),
    supabase.from("recipe_costs").select("*").eq("recipe_id", id).maybeSingle(),
    supabase.from("menu_item_margins").select("menu_item_id, name, selling_price, margin_pct"),
    supabase.from("organizations").select("target_margin_pct, default_labor_rate_per_hour, default_machine_rate_per_hour").maybeSingle(),
    supabase.from("menu_items").select("id").eq("recipe_id", id),
    getVocab(),
  ]);
  if (!recipe) notFound();
  const soldAs = (menu ?? []).filter((m) => (menuItems ?? []).some((mi) => mi.id === m.menu_item_id));

  const industry = await getIndustry();
  // A blank cell follows the material's waste % (migration 027); a line's
  // own %, 0 included, shows as typed.
  const initialRows = (recipeIngredients ?? []).map((ri) => ({
    ingredient_id: ri.ingredient_id,
    quantity: String(ri.quantity),
    unit: ri.unit,
    waste_pct: ri.waste_pct == null ? "" : String(Number(ri.waste_pct)),
  }));
  // Line cost includes waste (÷ (1 − waste %)), the line's own or else the
  // material's, as the recipe_costs view does.
  const breakdown = (recipeIngredients ?? [])
    .map((ri) => {
      const c = ri.ingredients?.current_unit_cost == null ? null : Number(ri.ingredients.current_unit_cost);
      const qty = Number(ri.quantity);
      const waste = effectiveWastePct(ri.waste_pct, ri.ingredients?.waste_pct);
      return { name: ri.ingredients?.name ?? "?", service: isServiceCategory(industry, ri.ingredients?.category), qty, unit: ri.unit, waste, unitCost: c, line: c == null ? null : lineCost(qty, c, waste), wasteExtra: c == null ? 0 : lineCost(qty, c, waste) - qty * c };
    })
    .sort((a, b) => (b.line ?? 0) - (a.line ?? 0));
  const batch = cost?.batch_total_cost == null ? null : Number(cost.batch_total_cost);
  const target = Number(org?.target_margin_pct ?? 65);
  const defaultLaborRate = Number(org?.default_labor_rate_per_hour ?? 0);
  const laborOverhead = laborOverheadOf(recipe, org);
  const anyWaste = breakdown.some((b) => b.waste > 0);
  const usesExtras = anyWaste || laborOverhead.laborMinutes > 0 || laborOverhead.overheadPct > 0 || laborOverhead.machineMinutes > 0;
  const materials = cost?.materials_cost == null ? null : Number(cost.materials_cost);
  const labor = Number(cost?.labor_cost ?? 0);
  const machine = Number(cost?.machine_cost ?? 0);
  // Machine time fields for industries that cost it, or a recipe that has some (migration 029).
  const machineFields = industry.features.machineTime || laborOverhead.machineMinutes > 0 || laborOverhead.machineRatePerHour != null;

  return (
    <>
      <PageHeader
        title={recipe.name}
        subtitle={
          <>
            <Link href="/recipes" className="underline">{v.recipes}</Link> · {lower(v.yield)} {recipe.batch_yield_qty} {recipe.batch_yield_unit}
          </>
        }
        actions={
          industry.features.costSheets || industry.features.quote === "piece" || industry.features.quote === "job" ? (
            <>
              {industry.features.costSheets && <ButtonLink href={`/sheet/${id}`}>Cost sheet</ButtonLink>}
              {industry.features.quote === "piece" && <ButtonLink href={`/quote?from=${id}`}>Quote a custom version</ButtonLink>}
              {industry.features.quote === "job" && <ButtonLink href={`/quote?from=${id}`}>Quote this job</ButtonLink>}
            </>
          ) : undefined
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-stone-200 bg-white px-3 py-2.5">
          <p className="text-[11px] font-semibold tracking-wider text-stone-500 uppercase">Cost per {v.serving} (live)</p>
          <p className="mt-1 text-2xl font-semibold text-stone-900 tabular-nums">{cost?.cost_per_serving != null ? `$${Number(cost.cost_per_serving).toFixed(4)}` : "—"}</p>
        </div>
        <Kpi
          label="Batch cost"
          value={money(batch)}
          tone={breakdown.some((b) => b.unitCost == null) ? "warning" : "neutral"}
          sub={breakdown.some((b) => b.unitCost == null) ? `no price yet: ${breakdown.filter((b) => b.unitCost == null).map((b) => b.name).join(", ")}` : `${breakdown.length} ${lower(breakdown.length === 1 ? v.ingredient : v.ingredients)}`}
          href={breakdown.some((b) => b.unitCost == null) ? "/ingredients" : undefined}
        />
        <Kpi label="Biggest cost" value={breakdown[0]?.line != null && batch ? `${Math.round((breakdown[0].line / batch) * 100)}%` : "—"} sub={breakdown[0]?.name ?? "—"} />
        <Kpi
          label="Sold as"
          value={soldAs.length}
          sub={soldAs.length ? soldAs.map((m) => `${m.name} ${m.margin_pct ?? "—"}%`).join(" · ") : `not ${v.onMenu} yet`}
          tone={soldAs.some((m) => m.margin_pct != null && Number(m.margin_pct) < target) ? "critical" : "neutral"}
          href={soldAs.length ? "/margins" : "/menu"}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Panel title={`${v.ingredients} in one batch — edit and save`} className="xl:col-span-7">
          <RecipeBuilder
            recipeId={id}
            ingredientOptions={allIngredients ?? []}
            initialRows={initialRows}
            initialLabor={{ labor_minutes: laborOverhead.laborMinutes, labor_rate_per_hour: laborOverhead.laborRatePerHour, overhead_pct: laborOverhead.overheadPct }}
            defaultLaborRate={defaultLaborRate}
            labels={{ ingredient: v.ingredient, ingredients: v.ingredients, recipe: lower(v.recipe) }}
            defaultWastePct={industry.defaults.default_waste_pct}
            showLaborByDefault={industry.defaults.show_labor_by_default}
            machine={machineFields ? { minutes: laborOverhead.machineMinutes, ratePerHour: laborOverhead.machineRatePerHour, defaultRate: Number(org?.default_machine_rate_per_hour ?? 0) } : undefined}
          />
        </Panel>
        <div className="flex flex-col gap-4 xl:col-span-5">
          {usesExtras && batch != null && materials != null && (
            <Panel title={machine > 0 ? "Batch cost: materials, labor, machine time, overhead" : "Batch cost: materials, labor, overhead"}>
              <CostBreakdown
                materials={materials}
                wasteExtra={breakdown.reduce((s, b) => s + b.wasteExtra, 0)}
                labor={labor}
                laborDetail={laborOverhead.laborMinutes > 0 ? `${laborOverhead.laborMinutes} min × $${laborRate(laborOverhead).toFixed(2)}/h` : null}
                overhead={Math.max(0, batch - materials - labor - machine)}
                machine={machine}
                outsourced={breakdown.reduce((s, b) => s + (b.service ? (b.line ?? 0) : 0), 0)}
                machineDetail={laborOverhead.machineMinutes > 0 ? `${laborOverhead.machineMinutes} min × $${machineRate(laborOverhead).toFixed(2)}/h` : null}
                overheadPct={laborOverhead.overheadPct}
                total={batch}
                perServing={cost?.cost_per_serving == null ? null : Number(cost.cost_per_serving)}
                yieldQty={Number(recipe.batch_yield_qty)}
                yieldUnit={recipe.batch_yield_unit}
                materialsLabel={v.ingredients}
              />
            </Panel>
          )}
          <Panel title={`Where this ${lower(v.recipe)}'s cost goes`} flush>
            {breakdown.length === 0 ? (
              <Empty>Add {lower(v.ingredients)} to see the cost breakdown.</Empty>
            ) : (
              <table className="w-full">
                <thead>
                  <tr>
                    <th className={th}>{v.ingredient}</th>
                    <th className={thNum}>Qty</th>
                    <th className={thNum}>Price</th>
                    <th className={thNum}>Cost</th>
                    <th className={`${th} w-28`}>Share</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdown.map((b, i) => (
                    <tr key={`${b.name}-${i}`} className={row}>
                      <td className={`${td} font-medium`}>{b.name}</td>
                      <td className={tdNum}>
                        {b.qty} {b.unit}
                        {b.waste > 0 && <span className="block text-[11px] text-stone-500">+{b.waste}% waste</span>}
                      </td>
                      <td className={tdNum}>{b.unitCost == null ? <span className="text-amber-700">no price</span> : unitMoney(b.unitCost)}</td>
                      <td className={tdNum}>{money(b.line)}</td>
                      <td className={td}>{b.line != null && batch ? <HBar share={b.line / batch} /> : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
