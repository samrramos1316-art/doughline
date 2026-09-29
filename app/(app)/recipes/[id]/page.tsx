import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RecipeBuilder } from "@/components/recipes/RecipeBuilder";
import { Panel, Kpi, PageHeader, HBar, Empty, money, unitMoney, th, thNum, td, tdNum, row } from "@/components/ui/dash";

export default async function RecipeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: recipe }, { data: recipeIngredients }, { data: allIngredients }, { data: cost }, { data: menu }, { data: org }, { data: menuItems }] = await Promise.all([
    supabase.from("recipes").select("*").eq("id", id).maybeSingle(),
    supabase.from("recipe_ingredients").select("ingredient_id, quantity, unit, ingredients(name, base_unit, current_unit_cost)").eq("recipe_id", id),
    supabase.from("ingredients").select("id, name, base_unit").order("name"),
    supabase.from("recipe_costs").select("*").eq("recipe_id", id).maybeSingle(),
    supabase.from("menu_item_margins").select("menu_item_id, name, selling_price, margin_pct"),
    supabase.from("organizations").select("target_margin_pct").maybeSingle(),
    supabase.from("menu_items").select("id").eq("recipe_id", id),
  ]);
  if (!recipe) notFound();
  const soldAs = (menu ?? []).filter((m) => (menuItems ?? []).some((mi) => mi.id === m.menu_item_id));

  const initialRows = (recipeIngredients ?? []).map((ri) => ({ ingredient_id: ri.ingredient_id, quantity: String(ri.quantity), unit: ri.unit }));
  const breakdown = (recipeIngredients ?? [])
    .map((ri) => {
      const c = ri.ingredients?.current_unit_cost == null ? null : Number(ri.ingredients.current_unit_cost);
      return { name: ri.ingredients?.name ?? "?", qty: Number(ri.quantity), unit: ri.unit, unitCost: c, line: c == null ? null : c * Number(ri.quantity) };
    })
    .sort((a, b) => (b.line ?? 0) - (a.line ?? 0));
  const batch = cost?.batch_total_cost == null ? null : Number(cost.batch_total_cost);
  const target = Number(org?.target_margin_pct ?? 65);

  return (
    <>
      <PageHeader
        title={recipe.name}
        subtitle={
          <>
            <Link href="/recipes" className="underline">Recipes</Link> · batch makes {recipe.batch_yield_qty} {recipe.batch_yield_unit}
          </>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-stone-200 bg-white px-3 py-2.5">
          <p className="text-[11px] font-semibold tracking-wider text-stone-500 uppercase">Cost per serving (live)</p>
          <p className="mt-1 text-2xl font-semibold text-stone-900 tabular-nums">{cost?.cost_per_serving != null ? `$${Number(cost.cost_per_serving).toFixed(4)}` : "—"}</p>
        </div>
        <Kpi
          label="Batch cost"
          value={money(batch)}
          tone={breakdown.some((b) => b.unitCost == null) ? "warning" : "neutral"}
          sub={breakdown.some((b) => b.unitCost == null) ? `no price yet: ${breakdown.filter((b) => b.unitCost == null).map((b) => b.name).join(", ")}` : `${breakdown.length} ingredient${breakdown.length === 1 ? "" : "s"}`}
          href={breakdown.some((b) => b.unitCost == null) ? "/ingredients" : undefined}
        />
        <Kpi label="Biggest cost" value={breakdown[0]?.line != null && batch ? `${Math.round((breakdown[0].line / batch) * 100)}%` : "—"} sub={breakdown[0]?.name ?? "—"} />
        <Kpi
          label="Sold as"
          value={soldAs.length}
          sub={soldAs.length ? soldAs.map((m) => `${m.name} ${m.margin_pct ?? "—"}%`).join(" · ") : "not on the menu yet"}
          tone={soldAs.some((m) => m.margin_pct != null && Number(m.margin_pct) < target) ? "critical" : "neutral"}
          href={soldAs.length ? "/margins" : "/menu"}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Panel title="Ingredients in one batch — edit and save" className="xl:col-span-7">
          <RecipeBuilder recipeId={id} ingredientOptions={allIngredients ?? []} initialRows={initialRows} />
        </Panel>
        <Panel title="Where this recipe's cost goes" flush className="xl:col-span-5">
          {breakdown.length === 0 ? (
            <Empty>Add ingredients to see the cost breakdown.</Empty>
          ) : (
            <table className="w-full">
              <thead>
                <tr>
                  <th className={th}>Ingredient</th>
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
                    <td className={tdNum}>{b.qty} {b.unit}</td>
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
    </>
  );
}
