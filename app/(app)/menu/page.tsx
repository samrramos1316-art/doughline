import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";
import { getOverview } from "@/lib/dashboard/overview";
import { NewMenuItemForm } from "@/components/menu/NewMenuItemForm";
import { Panel, Kpi, PageHeader, Pill, Delta, MarginBar, Spark, Empty, marginTone, money, th, thNum, td, tdNum, row } from "@/components/ui/dash";

const TONE_TEXT = { good: "On target", warning: "Watch", critical: "Below target", serious: "Watch", neutral: "No cost" } as const;
const SORTS = { margin: "Worst margin", name: "Name", price: "Price" } as const;

export default async function MenuPage({ searchParams }: { searchParams: Promise<{ sort?: string }> }) {
  const { sort = "margin" } = await searchParams;
  const supabase = await createClient();
  const orgId = await getCurrentOrgId(supabase);
  if (!orgId) redirect("/login");
  const [o, { data: recipes }] = await Promise.all([getOverview(supabase, orgId), supabase.from("recipes").select("id, name").order("name")]);
  const target = o.org.target;
  const items = [...o.menu].sort((a, b) =>
    sort === "name" ? a.name.localeCompare(b.name) : sort === "price" ? b.price - a.price : (a.marginPct ?? -1) - (b.marginPct ?? -1),
  );
  const priced = items.filter((m) => m.marginPct != null);
  const best = [...priced].sort((a, b) => b.marginPct! - a.marginPct!)[0];
  const worst = [...priced].sort((a, b) => a.marginPct! - b.marginPct!)[0];

  return (
    <>
      <PageHeader
        title="Menu & margins"
        subtitle={`${items.length} item${items.length === 1 ? "" : "s"} · target ${target}% · margins update the moment an invoice price lands`}
        tabs={Object.entries(SORTS).map(([k, label]) => ({ href: `/menu?sort=${k}`, label: `Sort: ${label}`, active: sort === k }))}
      />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Avg margin" value={o.kpis.avgMargin == null ? "—" : `${o.kpis.avgMargin.toFixed(1)}%`} tone={marginTone(o.kpis.avgMargin, target)} sub={<><Delta value={o.kpis.marginChange30d} suffix="pp" goodWhenUp /> in 30 days</>} />
        <Kpi label="Below target" value={`${o.kpis.belowTarget}/${o.kpis.activeItems}`} tone={o.kpis.belowTarget ? "critical" : "good"} sub={`under ${target}%`} />
        <Kpi label="Best" value={best ? `${best.marginPct!.toFixed(1)}%` : "—"} tone="good" sub={best?.name ?? "—"} />
        <Kpi label="Weakest" value={worst ? `${worst.marginPct!.toFixed(1)}%` : "—"} tone={marginTone(worst?.marginPct ?? null, target)} sub={worst?.name ?? "—"} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Panel title="Every menu item" flush className="xl:col-span-9">
          {items.length === 0 ? (
            <Empty>No menu items yet. Add one on the right — pick the recipe it&apos;s made from and its selling price.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className={th}>Name</th>
                    <th className={thNum}>Sells</th>
                    <th className={thNum}>Cost</th>
                    <th className={thNum}>Profit</th>
                    <th className={thNum}>Margin</th>
                    <th className={th}>vs target</th>
                    <th className={thNum}>30d</th>
                    <th className={th}>90-day trend</th>
                    <th className={th}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((m) => {
                    const tone = marginTone(m.marginPct, target);
                    return (
                      <tr key={m.id} className={row}>
                        <td className={td}>
                          <span className="font-medium text-stone-900">{m.name}</span>
                          <span className="block text-[11px] text-stone-500">{m.recipeName ?? "no recipe"}</span>
                        </td>
                        <td className={tdNum}>{money(m.price)}</td>
                        <td className={tdNum}>{m.costPerServing == null ? "—" : `$${m.costPerServing.toFixed(4)}`}</td>
                        <td className={tdNum}>{m.costPerServing == null ? "—" : money(m.price - m.costPerServing)}</td>
                        <td className={`${tdNum} font-semibold`}>{m.marginPct == null ? "—" : `${m.marginPct.toFixed(1)}%`}</td>
                        <td className={td}><MarginBar pct={m.marginPct} target={target} /></td>
                        <td className={tdNum}><Delta value={m.marginPct != null && m.marginPct30dAgo != null ? m.marginPct - m.marginPct30dAgo : null} suffix="pp" goodWhenUp /></td>
                        <td className={td}><Spark values={m.history.map((p) => p.value)} /></td>
                        <td className={td}>{m.isActive ? <Pill tone={tone}>{TONE_TEXT[tone]}</Pill> : <Pill tone="neutral">Inactive</Pill>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
        <Panel title="Add a menu item" className="xl:col-span-3">
          <NewMenuItemForm recipeOptions={recipes ?? []} />
          <p className="mt-3 text-xs text-stone-500">
            Cost per serving comes from the recipe; each invoice that changes an ingredient price moves it automatically.
          </p>
        </Panel>
      </div>
    </>
  );
}
