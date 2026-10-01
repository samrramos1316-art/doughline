import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin/access";
import { getAdminStats, EST_COST_PER_READ } from "@/lib/admin/stats";
import { Panel, Kpi, PageHeader, Empty, money, th, thNum, td, tdNum, row } from "@/components/ui/dash";

export const dynamic = "force-dynamic";

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—");
const ago = (iso: string | null) => {
  if (!iso) return "never";
  const d = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
};

// The owner's console: signups and activity across every business. Counts
// only — nothing inside anyone's invoices, recipes or menus. Anyone not in
// DOUGHTALLY_ADMIN_EMAILS gets a 404, so the page doesn't advertise itself.
export default async function AdminPage({ searchParams }: { searchParams: Promise<{ test?: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isAdmin(user?.email)) notFound();

  const { test } = await searchParams;
  const includeTest = test === "1";
  const s = await getAdminStats({ includeTest });
  const t = s.totals;

  return (
    <>
      <PageHeader
        title="Owner console"
        subtitle="Signups and activity across every DoughTally account — counts only, never what's inside them"
        tabs={[
          { href: "/admin", label: "Real accounts", active: !includeTest },
          { href: "/admin?test=1", label: `Including test accounts (${s.hiddenTest})`, active: includeTest },
        ]}
      />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Accounts" value={t.accounts} sub={`${t.new1} today · ${t.new7} this week · ${t.new30} this month`} />
        <Kpi label="Active, 7 days" value={t.active7} tone={t.active7 ? "good" : "neutral"} sub={`${t.active30} in 30 days · logged in or added something`} />
        <Kpi label="Actually used it" value={`${t.usedIt}/${t.accounts}`} sub="added an invoice, recipe, menu item or ingredient" />
        <Kpi
          label="AI spend, est."
          value={money(t.reads * EST_COST_PER_READ)}
          sub={`${money(t.reads30 * EST_COST_PER_READ)} in 30 days · ${t.reads} invoice reads`}
        />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Signups per day · 30 days">
          <DayBars data={s.signupsPerDay} noun="signup" />
        </Panel>
        <Panel title="Invoices uploaded per day · 30 days">
          <DayBars data={s.invoicesPerDay} noun="invoice" />
        </Panel>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Invoices" value={t.invoices} sub={`${t.invoices30} in 30 days`} />
        <Kpi label="Couldn't read" value={t.failed} tone={t.failed ? "warning" : "good"} sub={t.invoices ? `${Math.round((t.failed / t.invoices) * 100)}% of invoices` : "no invoices yet"} />
        <Kpi label="Recipes" value={t.recipes} />
        <Kpi label="Menu items" value={t.menuItems} sub={`${t.ingredients} ingredients`} />
      </div>

      <Panel title={`Every account · ${s.accounts.length}`} flush>
        {s.accounts.length === 0 ? (
          <Empty>No accounts yet{includeTest ? "" : " (besides test ones)"}.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className={th}>Business</th>
                  <th className={th}>Email</th>
                  <th className={th}>Signed up</th>
                  <th className={th}>Last active</th>
                  <th className={thNum}>Invoices</th>
                  <th className={thNum}>Couldn&apos;t read</th>
                  <th className={thNum}>Recipes</th>
                  <th className={thNum}>Menu items</th>
                  <th className={thNum}>Ingredients</th>
                </tr>
              </thead>
              <tbody>
                {s.accounts.map((a) => (
                  <tr key={a.email + a.signedUp} className={row}>
                    <td className={td}>
                      <span className="font-medium text-stone-900">{a.business}</span>
                      <span className="block text-[11px] text-stone-500">
                        {a.businessType?.replace("_", " ") ?? "type not given"}
                        {a.test && " · test"}
                      </span>
                    </td>
                    <td className={`${td} text-stone-600`}>
                      <a href={`mailto:${a.email}`} className="hover:underline">{a.email}</a>
                    </td>
                    <td className={`${td} tabular-nums`}>{day(a.signedUp)}</td>
                    <td className={`${td} tabular-nums`} title={a.lastActive ? day(a.lastActive) : undefined}>{ago(a.lastActive)}</td>
                    <td className={tdNum}>{a.invoices || "—"}</td>
                    <td className={tdNum}>{a.failed ? <span className="text-amber-700">{a.failed}</span> : "—"}</td>
                    <td className={tdNum}>{a.recipes || "—"}</td>
                    <td className={tdNum}>{a.menuItems || "—"}</td>
                    <td className={tdNum}>{a.ingredients || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <p className="mt-3 text-xs text-stone-500">
        AI spend is an estimate: about {money(EST_COST_PER_READ)} per invoice read. Menu and recipe imports aren&apos;t counted here — the{" "}
        <Link href="https://platform.claude.com" className="underline">Claude console</Link> has the exact bill.
      </p>
    </>
  );
}

// Thirty days of counts as thin bars on a shared baseline; hover a day for
// its number. One series, so no legend — the panel title names it.
function DayBars({ data, noun }: { data: { date: string; count: number }[]; noun: string }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const total = data.reduce((s, d) => s + d.count, 0);
  const label = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return (
    <figure>
      <div className="flex items-baseline justify-between text-xs text-stone-500">
        <span>
          <b className="text-lg font-semibold text-stone-900 tabular-nums">{total}</b> {noun}
          {total === 1 ? "" : "s"}
        </span>
        <span className="tabular-nums">peak {max === 1 && total === 0 ? 0 : max}/day</span>
      </div>
      <div role="img" aria-label={`${noun}s per day, last 30 days: ${total} in total`} className="relative mt-3 flex h-28 items-end gap-[2px] border-b border-stone-300">
        {data.map((d) => (
          <div key={d.date} className="group relative flex h-full flex-1 items-end">
            <div
              className="w-full rounded-t-[4px] bg-[#d97706] transition-opacity group-hover:opacity-80"
              style={{ height: d.count ? `${Math.max(4, (d.count / max) * 100)}%` : "0%" }}
            />
            {/* Hit target is the full column; the tooltip names the day. */}
            <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 rounded bg-stone-900 px-2 py-1 text-[11px] whitespace-nowrap text-white group-hover:block">
              {label(d.date)}: {d.count} {noun}
              {d.count === 1 ? "" : "s"}
            </span>
          </div>
        ))}
      </div>
      <figcaption className="mt-1 flex justify-between text-[11px] text-stone-500 tabular-nums">
        <span>{label(data[0].date)}</span>
        <span>today</span>
      </figcaption>
    </figure>
  );
}
