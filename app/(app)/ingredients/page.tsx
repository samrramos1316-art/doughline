import { createClient } from "@/lib/supabase/server";
import { IngredientsGrid } from "@/components/ingredients/IngredientsGrid";
import { isoDaysAgo } from "@/lib/dates/localDate";
import { Panel, PageHeader, Delta, Spark, Empty, unitMoney, th, thNum, td, tdNum, row } from "@/components/ui/dash";


export default async function IngredientsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const supabase = await createClient();
  const { data: ingredients } = await supabase
    .from("ingredients")
    .select("id, name, category, base_unit, current_unit_cost")
    .order("name");
  const list = ingredients ?? [];
  const tabs = [
    { href: "/ingredients", label: "Price list", active: tab !== "movers" && tab !== "history", count: list.length },
    { href: "/ingredients?tab=movers", label: "Price movers", active: tab === "movers" },
    { href: "/ingredients?tab=history", label: "Price history", active: tab === "history" },
  ];

  if (tab === "movers" || tab === "history") {
    const { data: history } = await supabase
      .from("ingredient_price_history")
      .select("id, ingredient_id, unit_cost, unit, effective_date, source, created_at, vendors(name), invoices(invoice_number)")
      .order("effective_date", { ascending: true })
      .order("created_at", { ascending: true });
    const hist = history ?? [];
    const byIng = new Map<string, typeof hist>();
    for (const h of hist) byIng.set(h.ingredient_id, [...(byIng.get(h.ingredient_id) ?? []), h]);
    const costOn = (id: string, date: string) => {
      let c: number | null = null;
      for (const h of byIng.get(id) ?? []) if (h.effective_date <= date) c = Number(h.unit_cost);
      return c;
    };
    const d30 = isoDaysAgo(30);
    const d90 = isoDaysAgo(90);
    const rows = list.map((i) => {
      const now = i.current_unit_cost == null ? null : Number(i.current_unit_cost);
      const hs = byIng.get(i.id) ?? [];
      const last = [...hs].reverse().find((h) => h.source === "invoice_scan");
      const pct = (then: number | null) => (now != null && then ? ((now - then) / then) * 100 : null);
      return {
        ...i,
        now,
        c30: pct(costOn(i.id, d30)),
        c90: pct(costOn(i.id, d90) ?? hs[0]?.unit_cost ?? null),
        points: hs.filter((h) => h.effective_date >= d90).map((h) => Number(h.unit_cost)),
        last,
      };
    });
    rows.sort((a, b) => Math.abs(b.c90 ?? 0) - Math.abs(a.c90 ?? 0));
    const names = new Map(list.map((i) => [i.id, i.name]));

    return (
      <>
        <PageHeader title="Ingredients" subtitle="What you pay, per base unit, and how it's moving" tabs={tabs} />
        {tab === "movers" ? (
          <Panel title="Every ingredient — biggest moves first" flush>
            {rows.length === 0 ? (
              <Empty>No ingredients yet.</Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className={th}>Ingredient</th>
                      <th className={th}>Category</th>
                      <th className={thNum}>Price now</th>
                      <th className={thNum}>30 days</th>
                      <th className={thNum}>90 days</th>
                      <th className={th}>90-day trend</th>
                      <th className={th}>Last invoice</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className={row}>
                        <td className={`${td} font-medium text-stone-900`}>{r.name}</td>
                        <td className={`${td} text-stone-500`}>{r.category?.replace("_", " ") ?? "—"}</td>
                        <td className={tdNum}>{unitMoney(r.now)}/{r.base_unit}</td>
                        <td className={tdNum}><Delta value={r.c30} /></td>
                        <td className={tdNum}><Delta value={r.c90} /></td>
                        <td className={td}><Spark values={r.points} goodWhenUp={false} /></td>
                        <td className={`${td} text-stone-500`}>
                          {r.last ? `${r.last.vendors?.name ?? "—"} · ${r.last.effective_date}` : "typed in"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        ) : (
          <Panel title={`Every recorded price · ${hist.length}`} flush>
            {hist.length === 0 ? (
              <Empty>No prices recorded yet.</Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className={th}>Date</th>
                      <th className={th}>Ingredient</th>
                      <th className={thNum}>Price</th>
                      <th className={th}>From</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...hist].reverse().map((h) => (
                      <tr key={h.id} className={row}>
                        <td className={`${td} tabular-nums`}>{h.effective_date}</td>
                        <td className={`${td} font-medium`}>{names.get(h.ingredient_id) ?? "—"}</td>
                        <td className={tdNum}>{unitMoney(Number(h.unit_cost))}/{h.unit}</td>
                        <td className={`${td} text-stone-500`}>
                          {h.source === "manual" ? "Typed in" : `${h.vendors?.name ?? "Invoice"}${h.invoices?.invoice_number ? ` · ${h.invoices.invoice_number}` : ""}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        )}
      </>
    );
  }

  return (
    <>
      <PageHeader title="Ingredients" subtitle="Edit in place or paste rows from a spreadsheet. Prices are per base unit; invoices keep them current." tabs={tabs} />
      <Panel title="Price list">
        <IngredientsGrid ingredients={list} />
      </Panel>
    </>
  );
}
