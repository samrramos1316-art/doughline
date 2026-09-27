import { MarginPill, Spark } from "./primitives";

// Every figure below comes from the app itself: the Sysco invoice and bakery
// used in its end-to-end tests, the +16.5% butter alert and the suggestions
// computed for it, Claude's narrative for that alert, and real USDA series
// (Jun 26 – Sep 25, 2026, downsampled).
export const WHEAT = [7.525, 7.735, 7.8425, 8.5, 8.61, 8.54, 8.325, 8.1475, 8.3075, 8.4575, 8.525, 9.3225, 9.205, 9.2375, 8.995, 8.7625, 8.52];
export const EGGS = [0.2412, 0.2677, 0.4552, 0.5898, 0.8656, 1.1305, 1.078, 1.0011, 0.8329, 0.4632, 0.362, 0.3856, 0.3614, 0.3547, 0.3564, 0.3495, 0.3914];
export const BUTTER = [1.65, 1.6375, 1.65, 1.585, 1.575, 1.47, 1.515, 1.55, 1.4625, 1.46, 1.445, 1.4625, 1.44, 1.37, 1.355, 1.34, 1.4];

const MENU = [
  { name: "Butter Croissant", price: 4.5, cost: 0.5694, before: 88.64, after: 87.35 },
  { name: "Chocolate Chip Cookie", price: 3.25, cost: 0.4903, before: 85.63, after: 84.92 },
  { name: "Cookie 6-Pack", price: 16, cost: 2.9416, before: 82.49, after: 81.62 },
  { name: "Custard Cup", price: 5, cost: 0.6327, before: 87.35, after: 87.35 },
];

export function DashboardMock() {
  return (
    <div className="grid text-left md:grid-cols-[180px_1fr]">
      <aside className="hidden border-r border-stone-900/5 bg-stone-50/60 p-4 md:block">
        <p className="mb-3 text-[11px] font-semibold tracking-wide text-stone-400 uppercase">Sweet Crumb Bakery</p>
        {["Dashboard", "Invoices", "Review", "Ingredients", "Recipes", "Menu", "Alerts", "Market"].map((n, i) => (
          <p key={n} className={`rounded-lg px-2.5 py-1.5 text-[13px] ${i === 0 ? "bg-white font-medium text-stone-900 shadow-sm ring-1 ring-stone-900/5" : "text-stone-500"}`}>
            {n}
            {n === "Alerts" && <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-800">1</span>}
          </p>
        ))}
      </aside>
      <div className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-lg font-semibold text-stone-900">Dashboard</p>
            <p className="text-xs text-stone-500">Target margin 65% · updated from invoice 7719-204583</p>
          </div>
          <span className="rounded-full bg-stone-900 px-3 py-1.5 text-xs font-medium text-white">Scan invoice</span>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[13px]">
          <span className="text-amber-900">
            <span className="font-semibold">Unsalted butter +16.5%</span> ($3.40 → $3.96/lb) · 3 menu items affected
          </span>
          <span className="shrink-0 font-medium text-amber-900 underline">View</span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {MENU.map((m) => (
            <div key={m.name} className="rounded-xl border border-stone-900/5 bg-white p-3.5 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[13px] font-medium text-stone-900">{m.name}</p>
                  <p className="text-[11px] text-stone-500">
                    ${m.price.toFixed(2)} · costs ${m.cost.toFixed(4)}
                  </p>
                </div>
                <MarginPill pct={m.after} />
              </div>
              <div className="mt-2 flex items-end justify-between">
                <Spark values={[m.before, m.before, m.before, m.before, m.after]} width={110} height={24} stroke={m.after < m.before ? "#e11d48" : "#059669"} />
                <span className={`text-[11px] font-medium tabular-nums ${m.after < m.before ? "text-rose-600" : "text-stone-400"}`}>
                  {m.after < m.before ? `${(m.after - m.before).toFixed(2)} pts` : "no change"}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="mb-2 text-[10px] font-semibold tracking-wide text-slate-500 uppercase">Market Watch · 90 days · context, not a forecast</p>
          <div className="grid grid-cols-3 gap-2">
            {[
              ["Wheat", "+13.2%", WHEAT],
              ["Eggs", "+62.3%", EGGS],
              ["Butter", "−15.2%", BUTTER],
            ].map(([n, p, v]) => (
              <div key={n as string} className="min-w-0 rounded-lg bg-white p-2 ring-1 ring-slate-200">
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-600">{n as string}</span>
                  <span className="font-medium text-slate-800">{p as string}</span>
                </div>
                <Spark values={v as number[]} width={100} height={20} fluid />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const INVOICE_LINES = [
  { raw: "AP FLOUR BLCHD 50# BG", qty: "3 BG", price: "21.48", read: "all-purpose bleached flour", pack: "50 lb", unit: "$0.4296/lb", match: "All-Purpose Flour", status: "matched" },
  { raw: "BUTTER SWT UNSLTD 36/1#", qty: "1 CS", price: "142.56", read: "unsalted sweet butter", pack: "36 lb", unit: "$3.96/lb", match: "Unsalted Butter", status: "review" },
  { raw: "EGG LG GR AA LSE 15DZ", qty: "2 CS", price: "48.75", read: "large grade AA eggs", pack: "15 dozen", unit: "$0.2708/each", match: "Large Eggs", status: "review" },
  { raw: "MILK WHL GAL 4/1", qty: "1 CS", price: "19.36", read: "whole milk", pack: "4 gal", unit: "$4.84/gal", match: "Whole Milk", status: "matched" },
];

export function InvoiceReadMock() {
  return (
    <div className="relative">
      <div className="rotate-[-1.5deg] rounded-xl bg-[#f4efe3] p-5 font-mono text-[11.5px] text-stone-700 shadow-[0_20px_50px_-20px_rgba(28,25,23,0.45)] ring-1 ring-stone-900/10">
        <div className="flex justify-between border-b border-dashed border-stone-400 pb-2">
          <span className="font-bold tracking-widest">SYSCO CENTRAL TEXAS</span>
          <span>INV 7719-204583 · 09/22/2026</span>
        </div>
        {INVOICE_LINES.map((l) => (
          <div key={l.raw} className="flex justify-between border-b border-dashed border-stone-300 py-1.5">
            <span className="rounded bg-amber-300/40 px-1">{l.raw}</span>
            <span>
              {l.qty} &nbsp; {l.price}
            </span>
          </div>
        ))}
      </div>

      <div className="relative -mt-3 ml-4 overflow-hidden rounded-xl bg-white shadow-xl ring-1 ring-stone-900/10 sm:ml-10">
        <div className="grid grid-cols-[1.2fr_0.7fr_0.8fr_1fr] gap-2 border-b border-stone-100 bg-stone-50 px-4 py-2 text-[10px] font-semibold tracking-wide text-stone-400 uppercase">
          <span>Read as</span>
          <span>Pack</span>
          <span>Cost</span>
          <span>Matched to</span>
        </div>
        {INVOICE_LINES.map((l) => (
          <div key={l.raw} className="grid grid-cols-[1.2fr_0.7fr_0.8fr_1fr] items-center gap-2 border-b border-stone-50 px-4 py-2 text-[12px] last:border-0">
            <span className="text-stone-700 italic">{l.read}</span>
            <span className="text-stone-500">{l.pack}</span>
            <span className="font-medium text-stone-900 tabular-nums">{l.unit}</span>
            <span className="flex items-center gap-1.5 text-stone-700">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${l.status === "matched" ? "bg-emerald-500" : "bg-amber-500"}`} />
              <span className="truncate">{l.match}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SwipeMock() {
  return (
    <div className="px-4 pt-10 pb-6">
      <p className="text-center text-[11px] text-stone-400">4 of 6 · Sysco Central Texas</p>
      <div className="relative mt-3">
        <div className="absolute inset-x-3 -bottom-2 h-full rounded-2xl bg-white/70 ring-1 ring-stone-900/5" aria-hidden />
        <div className="relative rotate-[2deg] rounded-2xl bg-white p-4 shadow-lg ring-1 ring-stone-900/5">
          <span className="absolute top-3 right-3 rounded-md border-2 border-emerald-500 px-1.5 text-[10px] font-bold text-emerald-600">CONFIRM</span>
          <p className="text-[10px] font-medium tracking-wide text-stone-400 uppercase">Scanned as</p>
          <p className="mt-0.5 text-[15px] font-medium text-stone-900">EGG LG GR AA LSE 15DZ</p>
          <p className="text-[12px] text-stone-500 italic">Read as “large grade AA eggs”</p>
          <p className="text-[11px] text-stone-500">2 CS · $48.75</p>
          <div className="mt-3 rounded-xl bg-stone-50 p-3 text-center">
            <p className="text-[10px] font-medium tracking-wide text-stone-400 uppercase">Low confidence — is this…</p>
            <p className="mt-0.5 text-lg font-semibold text-stone-900">Large Eggs</p>
            <p className="text-[11px] text-stone-500">68% similar</p>
          </div>
          <div className="mt-3 flex gap-2 text-[12px] font-medium">
            <span className="flex-1 rounded-full border border-rose-300 py-2 text-center text-rose-600">Not this</span>
            <span className="flex-1 rounded-full bg-emerald-600 py-2 text-center text-white">Confirm</span>
          </div>
        </div>
      </div>
      <p className="mt-5 text-center text-[11px] text-stone-400">Drag the card, or use the buttons</p>
    </div>
  );
}

export function AlertMock() {
  return (
    <div className="space-y-3 p-5 text-left">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[15px] font-semibold text-stone-900">Unsalted Butter price change</p>
          <p className="text-[12px] text-stone-500">$3.40/lb → $3.96/lb (+16.5%) · Sysco · Sep 22</p>
        </div>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">+16.5%</span>
      </div>
      <div className="overflow-hidden rounded-xl ring-1 ring-stone-900/5">
        {MENU.slice(0, 3).map((m) => (
          <div key={m.name} className="flex items-center justify-between border-b border-stone-100 px-3 py-2 text-[12px] last:border-0">
            <span className="text-stone-700">{m.name}</span>
            <span className="flex gap-3 tabular-nums">
              <span className="text-stone-400">{m.before.toFixed(2)}%</span>
              <span className="font-medium text-stone-900">{m.after.toFixed(2)}%</span>
              <span className="w-14 text-right text-rose-600">{(m.after - m.before).toFixed(2)}pp</span>
            </span>
          </div>
        ))}
      </div>
      <div className="rounded-xl bg-stone-50 p-3 text-[12px] text-stone-700 ring-1 ring-stone-900/5">
        <p className="font-medium text-stone-900">Butter Croissant</p>
        <p className="mt-1">
          Raise it from $4.50 to <span className="font-semibold">$5.02</span> (+$0.52) to keep its 88.64% margin.
        </p>
        <p className="mt-0.5">
          Or use <span className="font-semibold">2.82 oz less unsalted butter</span> per batch at the same price.
        </p>
      </div>
      <div className="rounded-xl bg-blue-50 p-3 text-[12px] leading-relaxed text-blue-950 ring-1 ring-blue-100">
        <p className="mb-1 text-[10px] font-semibold tracking-wide text-blue-700 uppercase">AI summary</p>
        “All three items are still comfortably above your 65% target, so absorbing this is a perfectly reasonable call.
        If you do want the old margins back, don&apos;t touch the croissant&apos;s butter: it&apos;s the whole point of the
        item…”
      </div>
    </div>
  );
}

export function MarketMock() {
  const cards: [string, string, string, number[], string][] = [
    ["Wheat, hard red winter", "+13.2%", "$7.53 → $8.52/bu", WHEAT, "Wheat prices are up 13.2% over 90 days — your All-Purpose Flour, Bread Flour costs may follow."],
    ["Eggs, large white", "+62.3%", "$0.24 → $0.39/dozen", EGGS, "Wholesale egg prices are up 62.3% over 90 days — your Large Eggs costs may follow."],
    ["Butter, Grade AA (CME)", "−15.2%", "$1.65 → $1.40/lb", BUTTER, "Butter prices are down 15.2% over 90 days — your Unsalted Butter costs may ease."],
  ];
  return (
    <div className="space-y-2.5 bg-slate-50 p-4 text-left">
      {cards.map(([label, pct, range, values, summary]) => (
        <div key={label} className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[13px] font-medium text-slate-900">{label}</p>
              <p className="text-[11px] text-slate-500">
                {range} · Jun 26 → Sep 25
              </p>
            </div>
            <span className="text-[13px] font-semibold text-slate-700 tabular-nums">{pct}</span>
          </div>
          <div className="mt-1.5 flex items-end gap-3">
            <p className="flex-1 text-[12px] leading-snug text-slate-600">{summary}</p>
            <Spark values={values} width={96} height={28} />
          </div>
        </div>
      ))}
      <p className="px-1 text-[10px] text-slate-400">Source: USDA AMS MyMarketNews · FAO Food Price Index</p>
    </div>
  );
}

export function GridMock() {
  const rows = [
    ["AP FLOUR BLCHD 50# BG", "3", "BG", "21.48", "50", "lb", "64.44", ""],
    ["BUTTER SWT UNSLTD 36/1#", "1", "CS", "142.56", "36", "lb", "142.56", ""],
    ["EGG LG GR AA LSE 15DZ", "2", "CS", "48.75", "15", "dozen", "79.50", "2 × $48.75 = $97.50, not $79.50"],
    ["MILK WHL GAL 4/1", "1", "CS", "19.36", "4", "gal", "19.36", ""],
  ];
  return (
    <div className="overflow-x-auto p-4">
      <table className="w-full min-w-[520px] text-left text-[11.5px]">
        <thead>
          <tr className="text-[10px] font-semibold tracking-wide text-stone-400 uppercase">
            {["Item (as printed)", "Qty", "Unit", "Price", "Pack", "Pack unit", "Total"].map((h) => (
              <th key={h} className="px-1 pb-2 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r[0]} className="align-top">
              {r.slice(0, 7).map((c, i) => (
                <td key={i} className="p-0.5">
                  <div className={`rounded-md px-2 py-1.5 ring-1 ${i === 6 && r[7] ? "bg-rose-50 text-rose-900 ring-rose-300" : "bg-white text-stone-800 ring-stone-200"} ${i > 0 && i !== 2 && i !== 5 ? "text-right tabular-nums" : ""}`}>
                    {c}
                  </div>
                  {i === 6 && r[7] && <p className="mt-0.5 w-32 text-[10px] leading-tight text-rose-600">{r[7]}</p>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
