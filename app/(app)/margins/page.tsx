import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";
import { getMargins, type ItemMargin } from "@/lib/dashboard/margins";
import { Panel, Kpi, PageHeader, Pill, MarginBar, HBar, Empty, marginTone, money, unitMoney } from "@/components/ui/dash";

const pct = (n: number | null) => (n == null ? "—" : `${n.toFixed(1)}%`);
const qtyFmt = (n: number) => (n >= 10 ? n.toFixed(1) : n >= 1 ? n.toFixed(2) : n.toFixed(4)).replace(/\.?0+$/, "") || "0";
// A few cents stays readable; fractions of a cent get more places.
const cents = (n: number | null) => (n == null ? "—" : Math.abs(n) >= 0.1 ? money(n) : `$${n.toFixed(4)}`);
const TONE_TEXT = { good: "On target", warning: "Watch", critical: "Below target", serious: "Watch", neutral: "No cost" } as const;

const cellL = "px-3 py-2 text-left text-[13px] text-stone-800 whitespace-nowrap";
const cellR = "px-3 py-2 text-right text-[13px] text-stone-800 tabular-nums whitespace-nowrap";
const head = "px-3 py-2 text-[11px] font-semibold tracking-wider text-stone-500 uppercase whitespace-nowrap";

export default async function MarginsPage() {
  const supabase = await createClient();
  const orgId = await getCurrentOrgId(supabase);
  if (!orgId) redirect("/login");
  const { target, items, total } = await getMargins(supabase, orgId);

  const sorted = [...items].sort((a, b) => (a.marginPct ?? Infinity) - (b.marginPct ?? Infinity));
  const priced = items.filter((m) => m.marginPct != null);
  const below = priced.filter((m) => m.marginPct! < target);
  const best = [...priced].sort((a, b) => b.marginPct! - a.marginPct!)[0];
  const notCosted = items.length - priced.length;

  return (
    <>
      <PageHeader
        title="Margins"
        subtitle={`Every menu item's cost worked out from its recipe, and your menu's total margin · target ${target}%`}
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
        <Kpi label="Not costed" value={notCosted} tone={notCosted ? "warning" : "good"} sub={notCosted ? "no recipe or a missing price" : "every item costed"} />
      </div>

      {items.length === 0 ? (
        <Panel title="Margins">
          <Empty>
            Nothing on the menu yet. <Link href="/onboarding/import?kind=menu" className="font-medium text-amber-700 underline">Import your menu</Link> and{" "}
            <Link href="/onboarding/import?kind=recipe" className="font-medium text-amber-700 underline">your recipes</Link>, and each item&apos;s margin is worked out here.
          </Empty>
        </Panel>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-stone-600">
            Worst margin first. Open an item to see the working: each ingredient&apos;s amount in the batch, divided by the servings a batch makes, times what you pay for it — added up to the cost of one, then taken off the selling price.
          </p>
          {sorted.map((m) => (
            <ItemCard key={m.id} m={m} target={target} />
          ))}
          <TotalCard total={total} items={items} target={target} />
        </div>
      )}
    </>
  );
}

function ItemCard({ m, target }: { m: ItemMargin; target: number }) {
  const tone = marginTone(m.marginPct, target);
  return (
    <details className="group rounded-lg border border-stone-200 bg-white shadow-[0_1px_2px_rgba(28,25,23,0.04)]" data-testid="margin-item" data-name={m.name}>
      <summary className="grid cursor-pointer list-none grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-3 md:grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,0.55fr))_auto_auto]">
        <span className="min-w-0">
          <span className="block truncate font-semibold text-stone-900">{m.name}</span>
          <span className="block truncate text-xs text-stone-500">{m.recipe ? `${m.recipe}${m.servings ? ` · ${qtyFmt(m.servings)} per batch` : ""}` : "no recipe linked"}</span>
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
            <Pill tone="neutral">No recipe</Pill>
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
            No recipe linked, so there&apos;s nothing to cost. <Link href="/menu" className="font-medium text-amber-700 underline">Menu</Link> → Edit to pick the recipe it&apos;s made from.
          </Empty>
        ) : m.parts.length === 0 ? (
          <Empty>
            {m.recipe} has no ingredients yet. <Link href={`/recipes/${m.recipeId}`} className="font-medium text-amber-700 underline">Add them to the recipe</Link>.
          </Empty>
        ) : !m.servings ? (
          <Empty>
            {m.recipe} doesn&apos;t say how many a batch makes. Set it on the <Link href={`/recipes/${m.recipeId}`} className="font-medium text-amber-700 underline">recipe</Link> or with Menu → Edit.
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full" aria-label={`How ${m.name}'s margin is worked out`}>
              <thead>
                <tr>
                  <th className={`${head} text-left`}>Ingredient</th>
                  <th className={`${head} text-right`}>In the batch</th>
                  <th className={`${head} text-right`}>÷ {qtyFmt(m.servings)} {m.servingsFromMenu ? "servings" : (m.yieldUnit ?? "servings")}</th>
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
                    <td className={cellR}>{p.unitCost == null ? <Link href="/ingredients" className="text-xs font-medium text-amber-700 hover:underline">no price yet</Link> : `${unitMoney(p.unitCost)}/${p.unit}`}</td>
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
            <Link href={`/recipes/${m.recipeId}`} className="text-amber-700 hover:underline">Open the recipe →</Link>
            <Link href="/menu" className="text-stone-500 hover:underline">Change the price or servings on Menu →</Link>
          </div>
        )}
      </div>
    </details>
  );
}

// The whole menu: one of every costed item, added up.
function TotalCard({ total, items, target }: { total: { items: number; sales: number; foodCost: number; profit: number; marginPct: number | null }; items: ItemMargin[]; target: number }) {
  const left = items.length - total.items;
  return (
    <section aria-label="Total margin" className="rounded-lg border-2 border-stone-900 bg-white" data-testid="margin-total">
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-3 md:grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,0.55fr))_auto]">
        <span className="col-span-2 min-w-0 md:col-span-1">
          <span className="block font-semibold text-stone-900">Whole menu</span>
          <span className="block text-xs text-stone-500">
            One of each of the {total.items} costed item{total.items === 1 ? "" : "s"}
            {left ? ` · ${left} not costed yet, left out` : ""}
          </span>
        </span>
        <Stat label="Sales" value={money(total.sales)} always />
        <Stat label="Food cost" value={money(total.foodCost)} always />
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
