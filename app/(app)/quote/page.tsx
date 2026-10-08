import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getIndustry } from "@/lib/supabase/vocab";
import { lower } from "@/lib/vocab";
import { PageHeader, Panel } from "@/components/ui/dash";
import { QuoteCalculator, type QuoteStart } from "@/components/quote/QuoteCalculator";

// The custom-order quote calculator (docs: jewelry core): price a one-off
// piece from materials, metal loss, labor and overhead at a target margin,
// then keep it as a build sheet and product if the customer says yes. Only
// for industries whose profile turns it on (lib/industries `features.quote`);
// everyone else gets a 404, as if the page didn't exist.
export default async function QuotePage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const industry = await getIndustry();
  if (!industry.features.quote) notFound();
  const { from } = await searchParams;
  const supabase = await createClient();
  const v = industry.vocab;

  const [{ data: materials }, { data: org }, base] = await Promise.all([
    supabase.from("ingredients").select("id, name, base_unit, current_unit_cost, waste_pct").order("name"),
    supabase.from("organizations").select("target_margin_pct, default_labor_rate_per_hour").maybeSingle(),
    from
      ? supabase
          .from("recipes")
          .select("name, batch_yield_qty, labor_minutes, labor_rate_per_hour, overhead_pct, recipe_ingredients(ingredient_id, quantity, waste_pct)")
          .eq("id", from)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  // ?from=<build sheet>: start from that piece, to quote a variation of it.
  const start: QuoteStart = base.data
    ? {
        name: `${base.data.name} (custom)`,
        pieces: Number(base.data.batch_yield_qty) || 1,
        lines: base.data.recipe_ingredients.map((ri) => ({
          ingredient_id: ri.ingredient_id,
          quantity: String(Number(ri.quantity)),
          waste_pct: ri.waste_pct == null ? "" : String(Number(ri.waste_pct)),
        })),
        labor_minutes: Number(base.data.labor_minutes) || 0,
        labor_rate_per_hour: base.data.labor_rate_per_hour == null ? null : Number(base.data.labor_rate_per_hour),
        overhead_pct: Number(base.data.overhead_pct) || 0,
      }
    : { name: "", pieces: 1, lines: [], labor_minutes: 0, labor_rate_per_hour: null, overhead_pct: industry.defaults.default_overhead_pct };

  return (
    <>
      <PageHeader
        title="Quote a custom piece"
        subtitle={`${v.ingredients}, loss, labor and overhead in; a price at your target margin out. Nothing is saved until you keep it as a ${lower(v.recipe)}.`}
      />
      <Panel title={base.data ? `Starting from ${base.data.name}` : "What goes into it"}>
        <QuoteCalculator
          materials={(materials ?? []).map((m) => ({
            id: m.id,
            name: m.name,
            base_unit: m.base_unit,
            unitCost: m.current_unit_cost == null ? null : Number(m.current_unit_cost),
            wastePct: Number(m.waste_pct ?? 0),
          }))}
          start={start}
          targetMarginPct={Number(org?.target_margin_pct ?? 65)}
          defaultLaborRate={Number(org?.default_labor_rate_per_hour ?? 0)}
        />
      </Panel>
    </>
  );
}
