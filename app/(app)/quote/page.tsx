import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getIndustry } from "@/lib/supabase/vocab";
import { lower } from "@/lib/vocab";
import { PageHeader, Panel } from "@/components/ui/dash";
import { QuoteCalculator, type QuoteStart } from "@/components/quote/QuoteCalculator";
import { EventQuote, type EventStart } from "@/components/quote/EventQuote";

// Quotes, by industry (lib/industries `features.quote`):
//  - "piece" (jewelry core): price a one-off piece from materials, metal
//    loss, labor and overhead at a target margin, then keep it as a build
//    sheet and product if the customer says yes.
//  - "event" (florist core): arrangements × quantities plus delivery, setup
//    and other costs, priced at a target margin.
// Everyone else gets the not-found page, as if it didn't exist.
type Params = { from?: string; name?: string; items?: string; delivery?: string; setup_minutes?: string; rate?: string; other?: string; target?: string; price?: string };

export default async function QuotePage({ searchParams }: { searchParams: Promise<Params> }) {
  const industry = await getIndustry();
  if (!industry.features.quote) notFound();
  const params = await searchParams;
  if (industry.features.quote === "event") return <EventQuotePage params={params} />;
  const { from } = params;
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

async function EventQuotePage({ params }: { params: Params }) {
  const supabase = await createClient();
  const v = (await getIndustry()).vocab;
  const [{ data: recipes }, { data: costs }, { data: org }] = await Promise.all([
    supabase.from("recipes").select("id, name, batch_yield_unit").order("name"),
    supabase.from("recipe_costs").select("recipe_id, cost_per_serving"),
    supabase.from("organizations").select("target_margin_pct, default_labor_rate_per_hour").maybeSingle(),
  ]);
  const costOf = new Map((costs ?? []).map((c) => [c.recipe_id, c.cost_per_serving == null ? null : Number(c.cost_per_serving)]));
  const ids = new Set((recipes ?? []).map((r) => r.id));
  // ?items=<recipe id>:<qty>,… — a quote reopened from its copied link.
  const start: EventStart = {
    name: params.name ?? "",
    items: (params.items ?? "")
      .split(",")
      .map((pair) => pair.split(":"))
      .filter(([id, qty]) => ids.has(id) && Number(qty) > 0)
      .map(([id, qty]) => ({ recipe_id: id, quantity: String(Number(qty)) })),
    delivery: params.delivery ?? "",
    setup_minutes: params.setup_minutes ?? "",
    rate: params.rate ?? "",
    other: params.other ?? "",
    target: params.target ?? "",
    price: params.price ?? "",
  };
  return (
    <>
      <PageHeader
        title="Event quote"
        subtitle={`Add up ${lower(v.recipes)} for a wedding or event, plus delivery and setup, and price the whole thing at your target margin.`}
      />
      <Panel title={start.name || "What the event needs"}>
        <EventQuote
          arrangements={(recipes ?? []).map((r) => ({ id: r.id, name: r.name, unit: r.batch_yield_unit, costEach: costOf.get(r.id) ?? null }))}
          start={start}
          targetMarginPct={Number(org?.target_margin_pct ?? 65)}
          defaultLaborRate={Number(org?.default_labor_rate_per_hour ?? 0)}
        />
      </Panel>
    </>
  );
}
