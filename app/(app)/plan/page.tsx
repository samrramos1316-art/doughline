import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getIndustry } from "@/lib/supabase/vocab";
import { lower } from "@/lib/vocab";
import { cleanPackSizes } from "@/lib/costing/units";
import type { PlanMaterial } from "@/lib/costing/orderPlan";
import { PageHeader, Panel } from "@/components/ui/dash";
import { OrderPlan, type PlanArrangement, type PlanStart } from "@/components/plan/OrderPlan";

// Order plan (florists, lib/industries features.orderPlan): the week's
// orders → stems and supplies to buy. ?items=<recipe id>:<count>,… reopens
// a plan, and an event quote links here with its arrangements.
export default async function PlanPage({ searchParams }: { searchParams: Promise<{ name?: string; items?: string }> }) {
  const industry = await getIndustry();
  if (!industry.features.orderPlan) notFound();
  const params = await searchParams;
  const v = industry.vocab;
  const supabase = await createClient();
  const [{ data: recipes }, { data: materials }] = await Promise.all([
    supabase.from("recipes").select("id, name, batch_yield_qty, recipe_ingredients(ingredient_id, quantity, waste_pct)").order("name"),
    supabase.from("ingredients").select("id, name, base_unit, waste_pct, current_unit_cost, pack_sizes"),
  ]);
  const arrangements: PlanArrangement[] = (recipes ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    yieldQty: Number(r.batch_yield_qty) || 1,
    lines: r.recipe_ingredients.map((l) => ({ ingredientId: l.ingredient_id, quantity: Number(l.quantity), wastePct: l.waste_pct == null ? null : Number(l.waste_pct) })),
  }));
  const mats: [string, PlanMaterial][] = (materials ?? []).map((m) => [
    m.id,
    { name: m.name, baseUnit: m.base_unit, wastePct: Number(m.waste_pct ?? 0), unitCost: m.current_unit_cost == null ? null : Number(m.current_unit_cost), packSizes: cleanPackSizes(m.pack_sizes) },
  ]);
  const ids = new Set(arrangements.map((a) => a.id));
  const start: PlanStart = {
    name: params.name ?? "",
    items: (params.items ?? "")
      .split(",")
      .map((pair) => pair.split(":"))
      .filter(([id, qty]) => ids.has(id) && Number(qty) > 0)
      .map(([id, qty]) => ({ recipe_id: id, quantity: String(Number(qty)) })),
  };

  return (
    <>
      <PageHeader
        title="Order plan"
        subtitle={`List the ${lower(v.recipes)} you're making this week and how many; see the ${lower(v.ingredients)} to buy, with spoilage, in bunches and boxes.`}
      />
      <Panel title={start.name || "This week's orders"}>
        <OrderPlan arrangements={arrangements} materials={mats} start={start} />
      </Panel>
    </>
  );
}
