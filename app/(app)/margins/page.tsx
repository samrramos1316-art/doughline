import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";
import { getMargins, type ItemMargin, type IngredientMargin } from "@/lib/dashboard/margins";
import { Panel, Kpi, PageHeader, Pill, Delta, MarginBar, HBar, Empty, marginTone, money, unitMoney } from "@/components/ui/dash";
import { getIndustry } from "@/lib/supabase/vocab";
import { lower, withArticle, type Vocab } from "@/lib/vocab";

// The industry's words (lib/industries); `food` keeps the food-only phrasing
// ("Food cost", "Whole menu") exactly as it was.
type Words = { v: Vocab; food: boolean };
const possessive = (word: string) => (word.endsWith("s") ? `${word}'` : `${word}'s`);

const pct = (n: number | null) => (n == null ? "—" : `${n.toFixed(1)}%`);
const qtyFmt = (n: number) => (n >= 10 ? n.toFixed(1) : n >= 1 ? n.toFixed(2) : n.toFixed(4)).replace(/\.?0+$/, "") || "0";
// A few cents stays readable; fractions of a cent get more places.
const cents = (n: number | null) => (n == null ? "—" : Math.abs(n) >= 0.1 ? money(n) : `$${n.toFixed(4)}`);
const TONE_TEXT = { good: "On target", warning: "Watch", critical: "Below target", serious: "Watch", neutral: "No cost" } as const;

const cellL = "px-3 py-2 text-left text-[13px] text-stone-800 whitespace-nowrap";
const cellR = "px-3 py-2 text-right text-[13px] text-stone-800 tabular-nums whitespace-nowrap";
const head = "px-3 py-2 text-[11px] font-semibold tracking-wider text-stone-500 uppercase whitespace-nowrap";

export default async function MarginsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  const supabase = await createClient();
  const orgId = await getCurrentOrgId(supabase);
  if (!orgId) redirect("/login");
  const [{ target, items, total, byIngredient }, industry] = await Promise.all([getMargins(supabase, orgId), getIndustry()]);
  const v = industry.vocab;
  const w: Words = { v, food: industry.family === "food" };
  const tabs = [
    { href: "/margins", label: v.menuItems, active: view !== "ingredients", count: items.length },
    { href: "/margins?view=ingredients", label: v.ingredients, active: view === "ingredients", count: byIngredient.length },
  ];
  if (view === "ingredients") return <IngredientsView list={byIngredient} target={target} tabs={tabs} w={w} />;

  const sorted = [...items].sort((a, b) => (a.marginPct ?? Infinity) - (b.marginPct ?? Infinity));
  const priced = items.filter((m) => m.marginPct != null);
  const below = priced.filter((m) => m.marginPct! < target);
  const best = [...priced].sort((a, b) => b.marginPct! - a.marginPct!)[0];
  const notCosted = items.length - priced.length;

  return (
    <>
      <PageHeader
        title="Margins"
        subtitle={`Every ${lower(v.menuItem)}'s cost worked out from its ${lower(v.recipe)}, and your ${possessive(lower(v.menu))} total margin · target ${target}%`}
        tabs={tabs}
      />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi
          label="Total margin"
          value={pct(total.marginPct)}
          tone={marginTone(total.marginPct, target)}
          sub={total.items ? `${money(total.profit)} kept of ${money(total.sales)} · one of each item` : "no costed items yet"}
        />
        <Kpi label="Below target" value={`${below.length}/${priced.length}`} tone={below.length ? "critical" : priced.length ? "good" : "neutral"} sub={below.length ? below.map((m) => m.name).join(", ") : `all at ${target}% or more`} />
        <Kpi label="Best" value={best ? pct(best.marginPct) : "—"} tone={best ? "good" : "neutral"} sub={best?.name ?? "—"} />
        <Kpi label="Not costed" value={notCosted} tone={notCosted ? "warning" : "good"} sub={notCosted ? `no ${lower(v.recipe)} or a missing price` : "every item costed"} />
      </div>

      {items.length === 0 ? (
        <Panel title="Margins">
          <Empty>
            Nothing {v.onMenu} yet. <Link href="/onboarding/import?kind=menu" className="font-medium text-amber-700 underline">Import your {lower(v.menu)}</Link> and{" "}
            <Link href="/onboarding/import?kind=recipe" className="font-medium text-amber-700 underline">your {lower(v.recipes)}</Link>, and each item&apos;s margin is worked out here.
          </Empty>
        </Panel>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-stone-600">
            Worst margin first. Open an item to see the working: each {lower(v.ingredient)}&apos;s amount in the batch, divided by the {v.servings} a batch makes, times what you pay for it — added up to the cost of one, then taken off the selling price.
          </p>
          {sorted.map((m) => (
            <ItemCard key={m.id} m={m} target={target} w={w} />
          ))}
          <TotalCard total={total} items={items} target={target} w={w} />
        </div>
      )}
    </>
  );
}

function ItemCard({ m, target, w: { v } }: { m: ItemMargin; target: number; w: Words }) {
  const tone = marginTone(m.marginPct, target);
  return (
    <details className="group rounded-lg border border-stone-200 bg-white shadow-[0_1px_2px_rgba(28,25,23,0.04)]" data-testid="margin-item" data-name={m.name}>
      <summary className="grid cursor-pointer list-none grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-3 md:grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,0.55fr))_auto_auto]">
        <span className="min-w-0">
          <span className="block truncate font-semibold text-stone-900">{m.name}</span>
          <span className="block truncate text-xs text-stone-500">{m.recipe ? `${m.recipe}${m.servings ? ` · ${qtyFmt(m.servings)} per batch` : ""}` : `no ${lower(v.recipe)} linked`}</span>
          <span className="mt-0.5 block text-xs tabular-nums text-stone-700 md:hidden">
            {m.cost == null ? `Sells for ${money(m.price)} · not costed yet` : <>{money(m.price)} − {cents(m.cost)} = {cents(m.profit)} · <b>{pct(m.marginPct)}</b></>}
          </span>
        </span>
        <Stat label="Sells for" value={money(m.price)} />
        <Stat label="Costs to make" value={cents(m.cost)} />
        <Stat label="Profit" value={cents(m.profit)} />
        <Stat label="Margin" value={pct(m.marginPct)} strong />
        <span className="hidden md:block"><MarginBar pct={m.marginPct} target={target} /></span>
        <span className="flex items-center gap-2 justify-self-end">
          {!m.recipe ? (
            <Pill tone="neutral">No {lower(v.recipe)}</Pill>
          ) : m.unpriced.length ? (
            <Pill tone="warning">Needs {m.unpriced.length} price{m.unpriced.length === 1 ? "" : "s"}</Pill>
          ) : (
            <Pill tone={tone}>{TONE_TEXT[tone]}</Pill>
          )}
          <Chevron />
        </span>
      </summary>
      <div className="border-t border-stone-100 pb-3">
        {!m.recipe ? (
          <Empty>
            No {lower(v.recipe)} linked, so there&apos;s nothing to cost. <Link href="/menu" className="font-medium text-amber-700 underline">{v.menu}</Link> → Edit to pick the {lower(v.recipe)} it&apos;s made from.
          </Empty>
        ) : m.parts.length === 0 ? (
          <Empty>
            {m.recipe} has no {lower(v.ingredients)} yet. <Link href={`/recipes/${m.recipeId}`} className="font-medium text-amber-700 underline">Add them to the {lower(v.recipe)}</Link>.
          </Empty>
        ) : !m.servings ? (
          <Empty>
            {m.recipe} doesn&apos;t say how many a batch makes. Set it on the <Link href={`/recipes/${m.recipeId}`} className="font-medium text-amber-700 underline">{lower(v.recipe)}</Link> or with {v.menu} → Edit.
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full" aria-label={`How ${m.name}'s margin is worked out`}>
              <thead>
                <tr>
                  <th className={`${head} text-left`}>{v.ingredient}</th>
                  <th className={`${head} text-right`}>In the batch</th>
                  <th className={`${head} text-right`}>÷ {qtyFmt(m.servings)} {m.servingsFromMenu ? v.servings : (m.yieldUnit ?? v.servings)}</th>
                  <th className={`${head} text-right`}>× price</th>
                  <th className={`${head} text-right`}>= cost of one</th>
                  <th className={`${head} text-left`}>Share of cost</th>
                </tr>
              </thead>
              <tbody>
                {m.parts.map((p) => (
                  <tr key={p.ingredientId} className="border-t border-stone-100">
                    <td className={`${cellL} font-medium`}>{p.name}</td>
                    <td className={cellR}>{qtyFmt(p.batchQty)} {p.unit}</td>
                    <td className={cellR}>{qtyFmt(p.qty)} {p.unit}</td>
                    <td className={cellR}>
                      {p.unitCost == null ? <Link href="/ingredients" className="text-xs font-medium text-amber-700 hover:underline">no price yet</Link> : `${unitMoney(p.unitCost)}/${p.unit}`}
                      {p.wastePct > 0 && <span className="block text-[11px] text-stone-500">+{Math.round(p.wastePct * 10) / 10}% waste</span>}
                    </td>
                    <td className={cellR}>{cents(p.cost)}</td>
                    <td className={`${cellL} w-40`}>
                      {p.shareOfCost == null ? <span className="text-xs text-stone-400">—</span> : (
                        <span className="flex items-center gap-2"><HBar share={p.shareOfCost} /><span className="w-9 text-right text-xs tabular-nums text-stone-600">{(p.shareOfCost * 100).toFixed(0)}%</span></span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-stone-200">
                {/* Only for recipes that log labor time or overhead (migration 025). */}
                {m.labor > 0 && (
                  <tr>
                    <td className={cellL} colSpan={4}>Labor</td>
                    <td className={cellR}>{cents(m.labor)}</td>
                    <td />
                  </tr>
                )}
                {m.machine > 0 && (
                  <tr>
                    <td className={cellL} colSpan={4}>Machine time</td>
                    <td className={cellR}>{cents(m.machine)}</td>
                    <td />
                  </tr>
                )}
                {m.overhead != null && m.overhead > 0 && (
                  <tr>
                    <td className={cellL} colSpan={4}>Overhead</td>
                    <td className={cellR}>{cents(m.overhead)}</td>
                    <td />
                  </tr>
                )}
                <tr>
                  <td className={`${cellL} font-semibold`} colSpan={4}>Cost to make one</td>
                  <td className={`${cellR} font-semibold`}>{m.cost == null ? `at least ${cents(m.knownCost)}` : cents(m.cost)}</td>
                  <td />
                </tr>
                <tr>
                  <td className={cellL} colSpan={4}>Sells for</td>
                  <td className={cellR}>{money(m.price)}</td>
                  <td />
                </tr>
                <tr>
                  <td className={cellL} colSpan={4}>Profit on each (price − cost)</td>
                  <td className={cellR}>{m.profit == null ? `at most ${cents(m.price - m.knownCost)}` : cents(m.profit)}</td>
                  <td />
                </tr>
                <tr>
                  <td className={`${cellL} font-semibold`} colSpan={4}>Margin (profit ÷ price)</td>
                  <td className={`${cellR} font-semibold ${tone === "critical" ? "text-red-600" : "text-stone-900"}`}>{pct(m.marginPct)}</td>
                  <td className={`${cellL} text-xs text-stone-500`}>{m.marginPct == null ? `waiting on a price for ${m.unpriced.join(", ")}` : `target ${target}%`}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        {m.recipeId && (
          <div className="flex gap-4 px-3 pt-2 text-xs font-medium">
            <Link href={`/recipes/${m.recipeId}`} className="text-amber-700 hover:underline">Open the {lower(v.recipe)} →</Link>
            <Link href="/menu" className="text-stone-500 hover:underline">Change the price or {v.servings} on {v.menu} →</Link>
          </div>
        )}
      </div>
    </details>
  );
}

// The whole menu: one of every costed item, added up.
function TotalCard({ total, items, target, w: { v, food } }: { total: { items: number; sales: number; foodCost: number; profit: number; marginPct: number | null }; items: ItemMargin[]; target: number; w: Words }) {
  const left = items.length - total.items;
  return (
    <section aria-label="Total margin" className="rounded-lg border-2 border-stone-900 bg-white" data-testid="margin-total">
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-3 md:grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,0.55fr))_auto]">
        <span className="col-span-2 min-w-0 md:col-span-1">
          <span className="block font-semibold text-stone-900">{food ? "Whole menu" : `All ${lower(v.menuItems)}`}</span>
          <span className="block text-xs text-stone-500">
            One of each of the {total.items} costed item{total.items === 1 ? "" : "s"}
            {left ? ` · ${left} not costed yet, left out` : ""}
          </span>
        </span>
        <Stat label="Sales" value={money(total.sales)} always />
        <Stat label={!food || items.some((i) => i.labor > 0 || i.machine > 0 || (i.overhead ?? 0) > 0) ? "Cost to make" : "Food cost"} value={money(total.foodCost)} always />
        <Stat label="Profit" value={money(total.profit)} always />
        <Stat label="Total margin" value={pct(total.marginPct)} strong always />
        <span className="col-span-2 self-center md:col-span-1"><MarginBar pct={total.marginPct} target={target} /></span>
      </div>
    </section>
  );
}

function Stat({ label, value, strong = false, always = false }: { label: string; value: React.ReactNode; strong?: boolean; always?: boolean }) {
  return (
    <span className={`${always ? "block" : "hidden md:block"} min-w-0`}>
      <span className="block text-[10px] font-semibold tracking-wider text-stone-500 uppercase">{label}</span>
      <span className={`block truncate tabular-nums ${strong ? "text-base font-semibold text-stone-900" : "text-sm text-stone-800"}`}>{value}</span>
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

// Ingredients: works with no recipes at all (price, movement, spend, history);
// with recipes, each one also shows what it costs every menu item it's in.
function IngredientsView({ list, target, tabs, w }: { list: IngredientMargin[]; target: number; tabs: { href: string; label: string; active: boolean; count: number }[]; w: Words }) {
  const { v } = w;
  const spend30 = list.reduce((x, i) => x + i.spend30, 0);
  const rising = list.filter((i) => (i.change30dPct ?? 0) > 0);
  const top = [...list].sort((a, b) => Math.abs(b.change90dPct ?? 0) - Math.abs(a.change90dPct ?? 0))[0];
  const inRecipes = list.filter((i) => i.uses.length).length;
  return (
    <>
      <PageHeader title="Margins" subtitle={`What each ${lower(v.ingredient)} costs you and how its price is moving — with or without ${lower(v.recipes)}`} tabs={tabs} />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Spent, 30 days" value={money(spend30, 0)} sub="on matched invoice lines" href="/invoices" />
        <Kpi label="Rising" value={rising.length} tone={rising.length ? "warning" : "good"} sub={rising.length ? `up in 30 days: ${rising.slice(0, 3).map((i) => i.name).join(", ")}` : "nothing up in 30 days"} />
        <Kpi label="Biggest move, 90 days" value={top?.change90dPct ? <Delta value={top.change90dPct} /> : "—"} sub={top?.change90dPct ? top.name : "no price changes yet"} />
        <Kpi label={`In ${withArticle(lower(v.menuItem))}`} value={`${inRecipes}/${list.length}`} tone={inRecipes < list.length ? "neutral" : "good"} sub={inRecipes < list.length ? "the rest show price and spend only" : "all linked to what you sell"} />
      </div>
      {list.length === 0 ? (
        <Panel title={v.ingredients}>
          <Empty>
            No {lower(v.ingredients)} yet. <Link href="/invoices/scan" className="font-medium text-amber-700 underline">Scan an invoice</Link> and every item you buy shows up here with its price.
          </Empty>
        </Panel>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-stone-600">
            Most spent on first. Open one for its price history and — if it&apos;s in {withArticle(lower(v.recipe))} — what it costs each {lower(v.menuItem)} and what its price change did to those margins.
          </p>
          {list.map((i) => (
            <IngredientCard key={i.id} i={i} target={target} w={w} />
          ))}
        </div>
      )}
    </>
  );
}

function IngredientCard({ i, target, w: { v, food } }: { i: IngredientMargin; target: number; w: Words }) {
  const worst = i.uses[0];
  const effect = i.uses.some((u) => u.impact30d != null) ? i.uses.reduce((x, u) => x + (u.impact30d ?? 0), 0) : null;
  return (
    <details className="group rounded-lg border border-stone-200 bg-white shadow-[0_1px_2px_rgba(28,25,23,0.04)]" data-testid="margin-ingredient" data-name={i.name}>
      <summary className="grid cursor-pointer list-none grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-3 md:grid-cols-[minmax(0,1.5fr)_repeat(4,minmax(0,0.6fr))_auto]">
        <span className="min-w-0">
          <span className="block truncate font-semibold text-stone-900">{i.name}</span>
          <span className="block truncate text-xs text-stone-500">
            {i.uses.length
              ? `in ${i.uses.length} ${lower(i.uses.length === 1 ? v.menuItem : v.menuItems)}${worst?.pctOfPrice != null ? ` · up to ${pct(worst.pctOfPrice)} of ${worst.menuItem}'s price` : ""}`
              : `not in ${withArticle(lower(v.menuItem))}'s ${lower(v.recipe)}`}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs tabular-nums text-stone-700 md:hidden">
            {i.costNow == null ? <span className="font-medium text-amber-700">no price</span> : `${unitMoney(i.costNow)}/${i.unit}`}
            {i.change30dPct != null && <> · <Delta value={i.change30dPct} /></>}
            {i.spend30 > 0 && <> · {money(i.spend30, 0)} spent</>}
          </span>
        </span>
        <Stat label="Price now" value={i.costNow == null ? <span className="text-amber-700">no price</span> : `${unitMoney(i.costNow)}/${i.unit}`} />
        <Stat label="30 days" value={<Delta value={i.change30dPct} />} />
        <Stat label="Spent, 30 days" value={i.spend30 ? money(i.spend30) : "—"} />
        <Stat label="Margin effect" value={effect == null ? <span className="text-stone-400">—</span> : <Delta value={effect} suffix=" pts" goodWhenUp dp={2} />} />
        <span className="justify-self-end"><Chevron /></span>
      </summary>
      <div className="border-t border-stone-100 pb-3">
        {i.uses.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full" aria-label={`What ${i.name} costs each ${lower(v.menuItem)}`}>
              <thead>
                <tr>
                  <th className={`${head} text-left`}>{v.menuItem}</th>
                  <th className={`${head} text-right`}>Uses per {v.serving}</th>
                  <th className={`${head} text-right`}>Costs</th>
                  <th className={`${head} text-right`}>Of the price</th>
                  <th className={`${head} text-right`}>{food ? "Of its food cost" : "Of its cost"}</th>
                  <th className={`${head} text-right`}>Item margin</th>
                  <th className={`${head} text-right`}>30-day effect</th>
                </tr>
              </thead>
              <tbody>
                {i.uses.map((u) => (
                  <tr key={u.menuItemId} className="border-t border-stone-100">
                    <td className={cellL}>
                      <span className="font-medium text-stone-900">{u.menuItem}</span>
                      <Link href={`/recipes/${u.recipeId}`} className="block text-[11px] text-stone-500 hover:underline">{u.recipe}</Link>
                    </td>
                    <td className={cellR}>{qtyFmt(u.qty)} {i.unit}</td>
                    <td className={cellR}>{cents(u.cost)}</td>
                    <td className={`${cellR} font-semibold`}>{pct(u.pctOfPrice)}</td>
                    <td className={cellR}>{u.shareOfCost == null ? "—" : `${(u.shareOfCost * 100).toFixed(0)}%`}</td>
                    <td className={`${cellR} ${marginTone(u.marginPct, target) === "critical" ? "font-semibold text-red-600" : ""}`}>{pct(u.marginPct)}</td>
                    <td className={cellR}><Delta value={u.impact30d} suffix=" pts" goodWhenUp dp={2} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {i.costNow != null && worst?.pctOfPrice != null && (
              <p className="px-3 pt-2 text-xs text-stone-500">
                If {i.name.toLowerCase()} goes up 10%, {worst.menuItem} loses {(worst.pctOfPrice * 0.1).toFixed(2)} margin points.
              </p>
            )}
          </div>
        ) : (
          <p className="px-3 pt-3 text-sm text-stone-600">
            {i.otherRecipes.length ? `In ${i.otherRecipes.join(", ")}, which isn't sold as ${withArticle(lower(v.menuItem))} yet.` : `Not in any ${lower(v.recipe)} yet.`} Its price is still tracked from every invoice.{" "}
            <Link href="/recipes" className="font-medium text-amber-700 underline">Add it to {withArticle(lower(v.recipe))}</Link> to see what it does to your margins.
          </p>
        )}
        {i.otherRecipes.length > 0 && i.uses.length > 0 && <p className="px-3 pt-2 text-xs text-stone-500">Also in {i.otherRecipes.join(", ")} — not sold as {withArticle(lower(v.menuItem))} yet.</p>}
        <div className="px-3 pt-3">
          <p className="text-[11px] font-semibold tracking-wider text-stone-500 uppercase">
            Price history{i.change90dPct != null && <span className="ml-2 font-normal tracking-normal normal-case"><Delta value={i.change90dPct} /> in 90 days</span>}
          </p>
          {i.history.length === 0 ? (
            <p className="pt-1 text-xs text-stone-500">No prices recorded yet — scan an invoice that has it, or type one on Ingredients.</p>
          ) : (
            <ul className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-xs tabular-nums text-stone-700">
              {i.history.map((h, k) => (
                <li key={k}>
                  <span className="text-stone-500">{h.date}</span> {unitMoney(h.cost)}/{i.unit}
                  {h.vendor && <span className="text-stone-500"> · {h.vendor}</span>}
                </li>
              ))}
            </ul>
          )}
          {i.spend90 > 0 && <p className="pt-1 text-xs text-stone-500">Spent {money(i.spend90)} on it in the last 90 days.</p>}
        </div>
      </div>
    </details>
  );
}
