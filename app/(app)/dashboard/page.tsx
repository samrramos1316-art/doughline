import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";
import { getOverview } from "@/lib/dashboard/overview";
import { getMarketTrends, DEFAULT_WINDOW_DAYS } from "@/lib/market/trends";
import { InvoiceStatusBadge } from "@/components/invoices/InvoiceStatusBadge";
import { getIndustry } from "@/lib/supabase/vocab";
import { lower } from "@/lib/vocab";
import {
  Panel, Kpi, PageHeader, ButtonLink, CameraIcon, Pill, Delta, MarginBar, Spark, HBar, Empty,
  marginTone, money, unitMoney, th, thNum, td, tdNum, row,
} from "@/components/ui/dash";

const TONE_TEXT = { good: "On target", warning: "Watch", critical: "Below target", serious: "Watch", neutral: "No cost" } as const;

export default async function DashboardPage() {
  const supabase = await createClient();
  const orgId = await getCurrentOrgId(supabase);
  if (!orgId) redirect("/login");
  const industry = await getIndustry();
  // Market Watch only for an industry with a series actually ingested (lib/industries).
  const [o, trends] = await Promise.all([
    getOverview(supabase, orgId),
    industry.hasMarketData ? getMarketTrends(supabase, { windowDays: DEFAULT_WINDOW_DAYS }) : Promise.resolve([]),
  ]);
  const v = industry.vocab;
  const { kpis, org } = o;
  const setupLeft = [
    !o.counts.ingredients && { href: "/ingredients", label: `Add your ${lower(v.ingredients)} (or import a spreadsheet)` },
    !o.counts.recipes && { href: "/onboarding/import?kind=recipe", label: `Import your ${lower(v.recipes)} from photos` },
    !o.counts.menuItems && { href: "/onboarding/import?kind=menu", label: `Import your ${lower(v.menu)} with its prices` },
    !o.counts.invoices && { href: "/invoices/scan", label: "Scan your first invoice" },
  ].filter(Boolean) as { href: string; label: string }[];
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const watched = trends.filter((t) => t.exposed_ingredients.length > 0).slice(0, 4);

  return (
    <>
      <PageHeader
        title="Overview"
        subtitle={`${today} · target margin ${org.target}%`}
        actions={
          <>
            <ButtonLink href="/margins">Margins</ButtonLink>
            <ButtonLink href="/add" primary>
              <CameraIcon /> Add from a photo
            </ButtonLink>
          </>
        }
      />

      {setupLeft.length > 0 && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
          <p className="text-sm font-semibold text-amber-900">Finish setting up — {4 - setupLeft.length} of 4 done</p>
          <ol className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1 text-sm">
            {setupLeft.map((s) => (
              <li key={s.label}>
                <Link href={s.href} className="font-medium text-amber-800 underline underline-offset-2">
                  {s.label}
                </Link>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Headline figures */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi
          label="Avg menu margin"
          value={kpis.avgMargin == null ? "—" : `${kpis.avgMargin.toFixed(1)}%`}
          tone={marginTone(kpis.avgMargin, org.target)}
          sub={<><Delta value={kpis.marginChange30d} suffix="pp" goodWhenUp /> vs 30 days ago</>}
          href="/menu"
        />
        <Kpi
          label="Below target"
          value={`${kpis.belowTarget}/${kpis.activeItems}`}
          tone={kpis.belowTarget ? "critical" : kpis.activeItems ? "good" : "neutral"}
          sub={kpis.belowTarget ? `${lower(v.menuItems)} under ${org.target}%` : "every item on target"}
          href="/menu"
        />
        <Kpi
          label="Cost to make"
          value={money(kpis.basketNow)}
          tone={kpis.basketChangePct != null && kpis.basketChangePct > 2 ? "warning" : "neutral"}
          sub={<><Delta value={kpis.basketChangePct} /> one of each item, 30d</>}
          href="/ingredients?tab=movers"
        />
        <Kpi
          label="Price alerts"
          value={kpis.openAlerts}
          tone={kpis.openAlerts ? "critical" : "good"}
          sub={kpis.openAlerts ? "open — costs went up" : "nothing open"}
          href="/alerts"
        />
        <Kpi
          label="To review"
          value={`${kpis.toReview}/${org.cap}`}
          tone={kpis.toReview > org.cap ? "critical" : kpis.toReview ? "warning" : "good"}
          sub={kpis.toReview ? "invoice lines waiting" : "all caught up"}
          href="/review"
        />
        <Kpi label="Spend, 30 days" value={money(kpis.spend30, 0)} sub={`${kpis.invoices30} invoice${kpis.invoices30 === 1 ? "" : "s"}`} href="/invoices" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        {/* Menu margins: the squad list */}
        <Panel title={`${v.menu} margins — worst first`} action={{ href: "/margins", label: "Margins" }} flush className="xl:col-span-8">
          {o.menu.length === 0 ? (
            <Empty>No {lower(v.menuItems)} yet. Add one on the {v.menu} tab to see its margin here.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className={th}>Item</th>
                    <th className={thNum}>Sells</th>
                    <th className={thNum}>Cost</th>
                    <th className={thNum}>Margin</th>
                    <th className={th}>vs {org.target}% target</th>
                    <th className={thNum}>30d</th>
                    <th className={th}>90-day trend</th>
                    <th className={th}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {o.menu.map((m) => {
                    const tone = marginTone(m.marginPct, org.target);
                    return (
                      <tr key={m.id} className={row}>
                        <td className={td}>
                          <span className="font-medium text-stone-900">{m.name}</span>
                          {m.recipeName && <span className="block text-[11px] text-stone-500">{m.recipeName}</span>}
                        </td>
                        <td className={tdNum}>{money(m.price)}</td>
                        <td className={tdNum}>{m.costPerServing == null ? "—" : `$${m.costPerServing.toFixed(2)}`}</td>
                        <td className={`${tdNum} font-semibold`}>{m.marginPct == null ? "—" : `${m.marginPct.toFixed(1)}%`}</td>
                        <td className={td}><MarginBar pct={m.marginPct} target={org.target} /></td>
                        <td className={tdNum}>
                          <Delta value={m.marginPct != null && m.marginPct30dAgo != null ? m.marginPct - m.marginPct30dAgo : null} suffix="pp" goodWhenUp />
                        </td>
                        <td className={td}><Spark values={m.history.map((p) => p.value)} /></td>
                        <td className={td}>
                          {!m.isActive ? (
                            <Pill tone="neutral">Inactive</Pill>
                          ) : m.unpriced.length ? (
                            <Link href="/ingredients" title={`No price yet: ${m.unpriced.join(", ")}`}>
                              <Pill tone="warning">{m.unpriced.length === 1 ? "Needs a price" : `Needs ${m.unpriced.length} prices`}</Pill>
                            </Link>
                          ) : m.recipeName == null ? (
                            <Pill tone="neutral">No {lower(v.recipe)}</Pill>
                          ) : (
                            <Pill tone={tone}>{TONE_TEXT[tone]}</Pill>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        {/* Inbox */}
        <Panel title={`Inbox${o.inbox.length ? ` · ${o.inbox.length}` : ""}`} flush className="xl:col-span-4">
          {o.inbox.length === 0 ? (
            <Empty>Nothing needs you. New invoices, price rises and anything to check land here.</Empty>
          ) : (
            <ul className="divide-y divide-stone-100">
              {o.inbox.slice(0, 8).map((it, i) => (
                <li key={`${it.href}-${i}`}>
                  <Link href={it.href} className="flex gap-3 px-3 py-2.5 hover:bg-amber-50/50">
                    <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${it.tone === "critical" ? "bg-red-500" : it.tone === "warning" ? "bg-amber-400" : "bg-stone-300"}`} />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-stone-900">{it.title}</span>
                      <span className="block truncate text-xs text-stone-500">{it.detail}</span>
                    </span>
                    <span className="ml-auto shrink-0 self-center text-xs text-stone-400">→</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Cost movers */}
        <Panel title={`${v.ingredient} cost movers · 90 days`} action={{ href: "/ingredients?tab=movers", label: "All prices" }} flush className="xl:col-span-4">
          {o.movers.length === 0 ? (
            <Empty>No price changes yet. They appear as invoices come in.</Empty>
          ) : (
            <table className="w-full">
              <tbody>
                {o.movers.slice(0, 7).map((m) => (
                  <tr key={m.id} className={row}>
                    <td className={td}>
                      <span className="font-medium text-stone-900">{m.name}</span>
                      <span className="block text-[11px] text-stone-500">
                        {unitMoney(m.from)} → {unitMoney(m.to)}/{m.unit}
                        {m.menuItems ? ` · in ${m.menuItems} item${m.menuItems === 1 ? "" : "s"}` : ""}
                      </span>
                    </td>
                    <td className={tdNum}><Delta value={m.pct} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        {/* Where the cost goes */}
        <Panel title={industry.family !== "food" || o.drivers.some((d) => d.kind !== "ingredient") ? "Where your cost goes" : "Where your food cost goes"} action={{ href: "/recipes", label: v.recipes }} className="xl:col-span-4">
          {o.drivers.length === 0 ? (
            <Empty>Build {lower(v.recipes)} and {lower(v.menuItems)} to see which {lower(v.ingredients)} drive your cost.</Empty>
          ) : (
            <>
              <p className="mb-2 text-xs text-stone-500">Share of the cost of making one of each {lower(v.menuItem)}.</p>
              <ul className="space-y-2">
                {o.drivers.slice(0, 7).map((d) => (
                  <li key={d.name}>
                    <div className="flex items-baseline justify-between gap-2 text-[13px]">
                      <span className="truncate text-stone-800">{d.name}</span>
                      <span className="shrink-0 text-stone-500 tabular-nums">
                        {(d.share * 100).toFixed(0)}% · ${d.perRound.toFixed(2)}
                      </span>
                    </div>
                    <HBar share={d.share} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </Panel>

        {/* Spend by vendor */}
        <Panel title="Spend by supplier · 90 days" action={{ href: "/invoices", label: "Invoices" }} className="xl:col-span-4">
          {o.vendorSpend.length === 0 ? (
            <Empty>Invoice totals by supplier show up after your first scan.</Empty>
          ) : (
            <ul className="space-y-2">
              {o.vendorSpend.slice(0, 6).map((v) => (
                <li key={v.name}>
                  <div className="flex items-baseline justify-between gap-2 text-[13px]">
                    <span className="truncate text-stone-800">{v.name}</span>
                    <span className="shrink-0 text-stone-600 tabular-nums">{money(v.total)}</span>
                  </div>
                  <HBar share={v.total / (o.vendorSpend[0].total || 1)} color="#57534e" />
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Recent invoices */}
        <Panel title="Recent invoices" action={{ href: "/invoices", label: "All invoices" }} flush className={industry.hasMarketData ? "xl:col-span-8" : "xl:col-span-12"}>
          {o.recent.length === 0 ? (
            <Empty>No invoices yet — snap one on your phone or import PDFs.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className={th}>Date</th>
                    <th className={th}>Supplier</th>
                    <th className={th}>Invoice #</th>
                    <th className={thNum}>Lines</th>
                    <th className={thNum}>Total</th>
                    <th className={th}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {o.recent.map((inv) => (
                    <tr key={inv.id} className={row}>
                      <td className={`${td} tabular-nums`}>{inv.date ?? "—"}</td>
                      <td className={td}>
                        <Link href={`/invoices/${inv.id}`} className="font-medium text-stone-900 hover:underline">
                          {inv.vendor}
                        </Link>
                      </td>
                      <td className={`${td} text-stone-500`}>{inv.number ?? "—"}</td>
                      <td className={tdNum}>{inv.lines}</td>
                      <td className={tdNum}>{money(inv.total)}</td>
                      <td className={td}><InvoiceStatusBadge status={inv.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        {/* Market */}
        {industry.hasMarketData && (
        <Panel title={`Market watch · ${DEFAULT_WINDOW_DAYS} days`} action={{ href: "/market", label: "Market" }} flush className="xl:col-span-4">
          {watched.length === 0 ? (
            <Empty>{trends.length ? "None of your ingredients follow a tracked commodity yet." : "Market data loads once a day from USDA and FAO."}</Empty>
          ) : (
            <table className="w-full">
              <tbody>
                {watched.map((t) => (
                  <tr key={t.commodity_code} className={row}>
                    <td className={`${td} whitespace-normal`}>
                      <span className="font-medium text-stone-900">{t.label}</span>
                      <span className="block text-[11px] text-stone-500">Your {t.exposed_ingredients.join(", ")}</span>
                    </td>
                    <td className={`${td} hidden px-1 sm:table-cell`}><Spark values={t.points.map((p) => p.value)} width={52} goodWhenUp={false} /></td>
                    <td className={tdNum}><Delta value={t.pct_change} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="border-t border-stone-100 px-3 py-2 text-[11px] text-stone-400">Wholesale context, not a forecast of your next invoice.</p>
        </Panel>
        )}
      </div>
    </>
  );
}
