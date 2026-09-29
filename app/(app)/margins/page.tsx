import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";
import { getMargins } from "@/lib/dashboard/margins";
import { Panel, Kpi, PageHeader, Pill, Delta, MarginBar, HBar, Empty, marginTone, money, unitMoney, th, thNum, td, tdNum, row } from "@/components/ui/dash";

const pct = (n: number | null, dp = 1) => (n == null ? "—" : `${n.toFixed(dp)}%`);
const qtyFmt = (n: number) => (n >= 10 ? n.toFixed(1) : n >= 1 ? n.toFixed(2) : n.toFixed(3)).replace(/\.?0+$/, "") || "0";
// A few cents stays readable; fractions of a cent get more places.
const perServing = (n: number | null) => (n == null ? "—" : n >= 0.1 ? money(n) : `$${n.toFixed(4)}`);

export default async function MarginsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  const byItem = view === "items";
  const supabase = await createClient();
  const orgId = await getCurrentOrgId(supabase);
  if (!orgId) redirect("/login");
  const { target, byIngredient, items } = await getMargins(supabase, orgId);

  const used = byIngredient.filter((i) => i.uses.length);
  const unused = byIngredient.filter((i) => !i.uses.length);
  const unpriced = used.filter((i) => i.costNow == null);
  const priced = items.filter((m) => m.marginPct != null);
  const avg = priced.length ? priced.reduce((s, m) => s + m.marginPct!, 0) / priced.length : null;
  const top = used.find((i) => i.perRound > 0);
  const rising = used.filter((i) => (i.change30dPct ?? 0) > 0).sort((a, b) => b.change30dPct! - a.change30dPct!)[0];

  return (
    <>
      <PageHeader
        title="Margins"
        subtitle={`What each ingredient costs you on every item you sell · target ${target}%`}
        tabs={[
          { href: "/margins", label: "By ingredient", active: !byItem, count: used.length },
          { href: "/margins?view=items", label: "By menu item", active: byItem, count: items.length },
        ]}
      />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Avg margin" value={pct(avg)} tone={marginTone(avg, target)} sub={`${priced.length} of ${items.length} items costed`} />
        <Kpi label="Biggest cost" value={top?.name ?? "—"} sub={top ? `${(top.shareOfFoodCost * 100).toFixed(0)}% of your food cost` : "no costed items yet"} />
        <Kpi
          label="Rising fastest"
          value={rising?.name ?? "—"}
          tone={rising ? "warning" : "good"}
          sub={rising ? <><Delta value={rising.change30dPct} /> in 30 days</> : "nothing up in 30 days"}
        />
        <Kpi label="Missing prices" value={unpriced.length} tone={unpriced.length ? "critical" : "good"} sub={unpriced.length ? "those items show no margin" : "every ingredient priced"} href={unpriced.length ? "/ingredients" : undefined} />
      </div>

      {items.length === 0 ? (
        <Panel title="Margins">
          <Empty>
            Nothing on the menu yet. <Link href="/onboarding/import?kind=menu" className="font-medium text-amber-700 underline">Import your menu</Link> and{" "}
            <Link href="/onboarding/import?kind=recipe" className="font-medium text-amber-700 underline">your recipes</Link>, and this page shows what every ingredient costs you on each item.
          </Empty>
        </Panel>
      ) : byItem ? (
        <div className="flex flex-col gap-3">
          {[...items].sort((a, b) => (a.marginPct ?? -1) - (b.marginPct ?? -1)).map((m) => {
            const tone = marginTone(m.marginPct, target);
            return (
              <details key={m.id} className="group rounded-lg border border-stone-200 bg-white shadow-[0_1px_2px_rgba(28,25,23,0.04)]" data-testid="margin-item" data-name={m.name}>
                <summary className="grid cursor-pointer list-none grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-3 md:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,0.6fr))_auto_auto]">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-stone-900">{m.name}</span>
                    <span className="block truncate text-xs text-stone-500">{m.recipe ?? "no recipe linked"}</span>
                    <span className="mt-0.5 block text-xs tabular-nums text-stone-700 md:hidden">Sells {money(m.price)} · costs {perServing(m.cost)} · <b>{pct(m.marginPct)}</b></span>
                  </span>
                  <Stat label="Sells" value={money(m.price)} />
                  <Stat label="Costs" value={perServing(m.cost)} />
                  <Stat label="Margin" value={pct(m.marginPct)} strong />
                  <span className="hidden md:block"><MarginBar pct={m.marginPct} target={target} /></span>
                  <span className="flex items-center gap-2 justify-self-end">
                    {m.unpriced.length ? <Pill tone="warning">Needs {m.unpriced.length} price{m.unpriced.length === 1 ? "" : "s"}</Pill> : m.recipe == null ? <Pill tone="neutral">No recipe</Pill> : <Pill tone={tone}>{tone === "good" ? "On target" : tone === "neutral" ? "No cost" : tone === "warning" ? "Watch" : "Below target"}</Pill>}
                    <Chevron />
                  </span>
                </summary>
                <div className="border-t border-stone-100 px-1 pb-2">
                  {m.parts.length === 0 ? (
                    <Empty>{m.recipe ? "This recipe has no ingredients yet." : <>Link this item to a recipe (<Link href="/menu" className="font-medium text-amber-700 underline">Menu</Link> → Edit) to see what it&apos;s made of.</>}</Empty>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr>
                            <th className={th}>Ingredient</th>
                            <th className={thNum}>Per serving</th>
                            <th className={thNum}>Costs</th>
                            <th className={thNum}>Of the price</th>
                            <th className={th}>Share of food cost</th>
                          </tr>
                        </thead>
                        <tbody>
                          {m.parts.map((p) => (
                            <tr key={p.ingredientId} className={row}>
                              <td className={`${td} font-medium`}>{p.name}</td>
                              <td className={tdNum}>{qtyFmt(p.qty)} {p.unit}</td>
                              <td className={tdNum}>{p.cost == null ? <Link href="/ingredients" className="text-xs font-medium text-amber-700 hover:underline">no price</Link> : perServing(p.cost)}</td>
                              <td className={tdNum}>{p.cost == null || m.price <= 0 ? "—" : pct((p.cost / m.price) * 100)}</td>
                              <td className={`${td} w-48`}>{p.shareOfCost == null ? <span className="text-xs text-stone-400">—</span> : <span className="flex items-center gap-2"><HBar share={p.shareOfCost} /><span className="w-9 text-right text-xs tabular-nums text-stone-600">{(p.shareOfCost * 100).toFixed(0)}%</span></span>}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {m.recipeId && <Link href={`/recipes/${m.recipeId}`} className="ml-3 text-xs font-medium text-amber-700 hover:underline">Open the recipe →</Link>}
                </div>
              </details>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-stone-600">
            Ingredients that cost you the most come first. Open one to see every menu item it goes into, how much of the selling price it takes, and what its price change in the last 30 days did to each margin.
          </p>
          {used.map((i) => {
            const worst = i.uses[0];
            const impact = i.uses.reduce((s, u) => s + (u.impact30d ?? 0), 0);
            return (
              <details key={i.id} className="group rounded-lg border border-stone-200 bg-white shadow-[0_1px_2px_rgba(28,25,23,0.04)]" data-testid="margin-ingredient" data-name={i.name}>
                <summary className="grid cursor-pointer list-none grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-3 md:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,0.7fr))_minmax(0,1.2fr)_auto]">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-stone-900">{i.name}</span>
                    <span className="block truncate text-xs text-stone-500">
                      in {i.uses.length} menu item{i.uses.length === 1 ? "" : "s"}
                      {worst?.pctOfPrice != null ? ` · up to ${pct(worst.pctOfPrice)} of ${worst.menuItem}'s price` : ""}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-xs tabular-nums text-stone-700 md:hidden">
                      {i.costNow == null ? <span className="font-medium text-amber-700">no price</span> : `${unitMoney(i.costNow)}/${i.unit}`}{i.change30dPct != null && <> · <Delta value={i.change30dPct} /></>} · {(i.shareOfFoodCost * 100).toFixed(0)}% of food cost
                    </span>
                  </span>
                  <Stat label="Price now" value={i.costNow == null ? "no price" : `${unitMoney(i.costNow)}/${i.unit}`} warn={i.costNow == null} />
                  <Stat label="30 days" value={<Delta value={i.change30dPct} />} />
                  <Stat label="Margin effect" value={i.uses.some((u) => u.impact30d != null) ? <Delta value={impact} suffix=" pts" goodWhenUp /> : <span className="text-stone-400">—</span>} />
                  <span className="hidden min-w-0 md:block">
                    <span className="mb-1 block text-[10px] font-semibold tracking-wider text-stone-500 uppercase">Share of food cost · {(i.shareOfFoodCost * 100).toFixed(0)}%</span>
                    <HBar share={i.shareOfFoodCost} />
                  </span>
                  <span className="justify-self-end"><Chevron /></span>
                </summary>
                <div className="border-t border-stone-100 px-1 pb-2">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr>
                          <th className={th}>Menu item</th>
                          <th className={thNum}>Uses per serving</th>
                          <th className={thNum}>Costs</th>
                          <th className={thNum}>Of the price</th>
                          <th className={thNum}>Of the food cost</th>
                          <th className={thNum}>Item margin</th>
                          <th className={thNum}>30-day effect</th>
                        </tr>
                      </thead>
                      <tbody>
                        {i.uses.map((u) => (
                          <tr key={u.menuItemId} className={row}>
                            <td className={td}>
                              <span className="font-medium text-stone-900">{u.menuItem}</span>
                              <Link href={`/recipes/${u.recipeId}`} className="block text-[11px] text-stone-500 hover:underline">{u.recipe}</Link>
                            </td>
                            <td className={tdNum}>{qtyFmt(u.qty)} {i.unit}</td>
                            <td className={tdNum}>{perServing(u.cost)}</td>
                            <td className={`${tdNum} font-semibold`}>{pct(u.pctOfPrice)}</td>
                            <td className={tdNum}>{u.shareOfCost == null ? "—" : `${(u.shareOfCost * 100).toFixed(0)}%`}</td>
                            <td className={tdNum}><span className={marginTone(u.marginPct, target) === "critical" ? "font-semibold text-red-600" : ""}>{pct(u.marginPct)}</span></td>
                            <td className={tdNum}><Delta value={u.impact30d} suffix=" pts" goodWhenUp dp={2} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {i.otherRecipes.length > 0 && <p className="px-3 pt-2 text-xs text-stone-500">Also in {i.otherRecipes.join(", ")} — not sold as a menu item yet.</p>}
                  {i.costNow != null && worst?.pctOfPrice != null && (
                    <p className="px-3 pt-2 text-xs text-stone-500">
                      If {i.name.toLowerCase()} goes up 10%, {worst.menuItem} loses {(worst.pctOfPrice * 0.1).toFixed(2)} margin points.
                    </p>
                  )}
                </div>
              </details>
            );
          })}
          {unused.length > 0 && (
            <p className="text-xs text-stone-500">
              Not in anything you sell: {unused.map((i) => i.name).join(", ")}.
            </p>
          )}
        </div>
      )}
    </>
  );
}

function Stat({ label, value, strong = false, warn = false }: { label: string; value: React.ReactNode; strong?: boolean; warn?: boolean }) {
  return (
    <span className="hidden min-w-0 md:block">
      <span className="block text-[10px] font-semibold tracking-wider text-stone-500 uppercase">{label}</span>
      <span className={`block truncate text-sm tabular-nums ${strong ? "font-semibold text-stone-900" : warn ? "font-medium text-amber-700" : "text-stone-800"}`}>{value}</span>
    </span>
  );
}

function Chevron() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4 text-stone-400 transition group-open:rotate-180" aria-hidden>
      <path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
