import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { NewRecipeForm } from "@/components/recipes/NewRecipeForm";
import { getVocab } from "@/lib/supabase/vocab";
import { cap, lower } from "@/lib/vocab";
import { Panel, Kpi, PageHeader, ButtonLink, Empty, CameraIcon, money, th, thNum, td, tdNum, row } from "@/components/ui/dash";

export default async function RecipesPage() {
  const supabase = await createClient();
  const [{ data: recipes }, { data: costs }, { data: lines }, { data: menu }, v] = await Promise.all([
    supabase.from("recipes").select("id, name, batch_yield_qty, batch_yield_unit").order("name"),
    supabase.from("recipe_costs").select("recipe_id, batch_total_cost, cost_per_serving, unpriced_ingredients"),
    supabase.from("recipe_ingredients").select("recipe_id"),
    supabase.from("menu_items").select("name, recipe_id, is_active"),
    getVocab(),
  ]);
  const costBy = new Map((costs ?? []).map((c) => [c.recipe_id, c]));
  const countBy = new Map<string, number>();
  for (const l of lines ?? []) countBy.set(l.recipe_id, (countBy.get(l.recipe_id) ?? 0) + 1);
  const menuBy = new Map<string, string[]>();
  for (const m of menu ?? []) if (m.recipe_id && m.is_active) menuBy.set(m.recipe_id, [...(menuBy.get(m.recipe_id) ?? []), m.name]);
  const list = recipes ?? [];
  const unused = list.filter((r) => !menuBy.has(r.id)).length;
  const empty = list.filter((r) => !countBy.has(r.id)).length;

  return (
    <>
      <PageHeader
        title={v.recipes}
        subtitle={`What each batch costs to make, live from today's ${lower(v.ingredient)} prices`}
        actions={
          <ButtonLink href="/onboarding/import?kind=recipe" primary>
            <CameraIcon /> Import {lower(v.recipes)} from a photo
          </ButtonLink>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label={v.recipes} value={list.length} />
        <Kpi label={cap(v.onMenu)} value={list.length - unused} sub={unused ? `${unused} not sold yet` : "all in use"} tone={unused ? "warning" : "neutral"} />
        <Kpi label={`Missing ${lower(v.ingredients)}`} value={empty} tone={empty ? "warning" : "good"} sub={empty ? "no cost until filled in" : `every ${lower(v.recipe)} costed`} />
        <Kpi label={v.menuItems} value={(menu ?? []).filter((m) => m.is_active).length} href="/menu" />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Panel title={`All ${lower(v.recipes)}`} flush className="xl:col-span-9">
          {list.length === 0 ? (
            <Empty>No {lower(v.recipes)} yet. <Link href="/onboarding/import?kind=recipe" className="font-medium text-amber-700 underline">Import them from photos or PDFs</Link>, or create one by hand.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className={th}>{v.recipe}</th>
                    <th className={thNum}>{v.yield}</th>
                    <th className={thNum}>{v.ingredients}</th>
                    <th className={thNum}>Batch cost</th>
                    <th className={thNum}>Cost/{v.serving}</th>
                    <th className={th}>Sold as</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((r) => {
                    const c = costBy.get(r.id);
                    return (
                      <tr key={r.id} className={row}>
                        <td className={td}>
                          <Link href={`/recipes/${r.id}`} className="font-medium text-stone-900 hover:underline">
                            {r.name}
                          </Link>
                        </td>
                        <td className={tdNum}>
                          {r.batch_yield_qty} {r.batch_yield_unit}
                        </td>
                        <td className={tdNum}>{countBy.get(r.id) ?? <span className="text-amber-700">none yet</span>}</td>
                        <td className={tdNum}>{money(c?.batch_total_cost == null ? null : Number(c.batch_total_cost))}</td>
                        <td className={`${tdNum} font-semibold`}>
                          {c?.unpriced_ingredients ? (
                            <Link href="/ingredients" className="text-xs font-medium text-amber-700 hover:underline">{c.unpriced_ingredients} without a price</Link>
                          ) : c?.cost_per_serving == null ? "—" : `$${Number(c.cost_per_serving).toFixed(4)}`}
                        </td>
                        <td className={`${td} text-stone-500`}>{menuBy.get(r.id)?.join(", ") ?? <span className="text-stone-400">Not {v.onMenu}</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
        <Panel title={`New ${lower(v.recipe)} by hand`} className="xl:col-span-3">
          <NewRecipeForm labels={{ recipe: lower(v.recipe), yield: v.yield, yieldExample: v.yieldExample }} />
        </Panel>
      </div>
    </>
  );
}
