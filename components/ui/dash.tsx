import Link from "next/link";
import { STATUS_COLORS, type StatusKey } from "@/lib/visual/statusColors";

// The app's control-room building blocks: dense panels with a small caps
// header, headline figures, tabbed page headers and compact tables — so an
// owner sees the state of the business at a glance, then drills into a tab.

export const th = "px-3 py-2 text-left text-[11px] font-semibold tracking-wider text-stone-500 uppercase whitespace-nowrap";
export const thNum = `${th} text-right`;
export const td = "px-3 py-2 text-[13px] text-stone-800 whitespace-nowrap";
export const tdNum = `${td} text-right tabular-nums`;
export const row = "border-t border-stone-100 hover:bg-amber-50/40";

export function Panel({
  title,
  action,
  children,
  className = "",
  flush = false,
  id,
}: {
  title: React.ReactNode;
  action?: { href: string; label: string };
  children: React.ReactNode;
  className?: string;
  flush?: boolean; // body with no padding (tables run edge to edge)
  id?: string;
}) {
  return (
    <section id={id} aria-label={typeof title === "string" ? title : undefined} className={`flex min-w-0 flex-col overflow-hidden rounded-lg border border-stone-200 bg-white shadow-[0_1px_2px_rgba(28,25,23,0.04)] ${className}`}>
      <header className="flex items-center justify-between gap-3 border-b border-stone-200 bg-stone-50/80 px-3 py-2">
        <h2 className="truncate text-[11px] font-semibold tracking-[0.12em] text-stone-600 uppercase">{title}</h2>
        {action && (
          <Link href={action.href} className="shrink-0 text-xs font-medium text-amber-700 hover:text-amber-900">
            {action.label} →
          </Link>
        )}
      </header>
      <div className={`min-w-0 flex-1 ${flush ? "" : "p-3"}`}>{children}</div>
    </section>
  );
}

export function Kpi({
  label,
  value,
  sub,
  tone = "neutral",
  href,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: StatusKey;
  href?: string;
}) {
  const { color } = STATUS_COLORS[tone];
  const body = (
    <>
      <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-stone-500 uppercase">
        <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: tone === "neutral" ? "#a8a29e" : color }} />
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-stone-900 tabular-nums">{value}</p>
      {sub && <div className="mt-0.5 truncate text-xs text-stone-500">{sub}</div>}
    </>
  );
  const cls = "block min-w-0 rounded-lg border border-stone-200 bg-white px-3 py-2.5 shadow-[0_1px_2px_rgba(28,25,23,0.04)]";
  return href ? (
    <Link href={href} className={`${cls} transition hover:border-amber-300`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export type Tab = { href: string; label: string; active: boolean; count?: number };

export function PageHeader({
  title,
  subtitle,
  tabs,
  actions,
}: {
  title: string;
  subtitle?: React.ReactNode;
  tabs?: Tab[];
  actions?: React.ReactNode;
}) {
  return (
    <div className="-mx-4 -mt-4 mb-4 border-b border-stone-200 bg-white px-4 pt-4 lg:-mx-6 lg:-mt-5 lg:px-6 lg:pt-5">
      <div className="flex flex-wrap items-end justify-between gap-3 pb-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-stone-900">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-stone-500">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {tabs && (
        <nav aria-label={`${title} sections`} className="-mb-px flex gap-1 overflow-x-auto">
          {tabs.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              aria-current={t.active ? "page" : undefined}
              className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap ${
                t.active ? "border-amber-500 text-stone-900" : "border-transparent text-stone-500 hover:text-stone-800"
              }`}
            >
              {t.label}
              {t.count != null && (
                <span className={`rounded px-1.5 text-[11px] tabular-nums ${t.active ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-600"}`}>{t.count}</span>
              )}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}

export function ButtonLink({ href, children, primary = false }: { href: string; children: React.ReactNode; primary?: boolean }) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${
        primary ? "bg-stone-900 text-white hover:bg-stone-800" : "border border-stone-300 bg-white text-stone-700 hover:border-stone-400"
      }`}
    >
      {children}
    </Link>
  );
}

export function Pill({ tone, children }: { tone: StatusKey; children: React.ReactNode }) {
  const { color, bg } = STATUS_COLORS[tone];
  return (
    <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap" style={{ backgroundColor: bg, color }}>
      <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {children}
    </span>
  );
}

// "+18.0%" in red when a cost rises (bad for the business), green when it
// falls; `goodWhenUp` flips it for things like margin.
export function Delta({ value, suffix = "%", goodWhenUp = false, dp = 1 }: { value: number | null; suffix?: string; goodWhenUp?: boolean; dp?: number }) {
  if (value == null) return <span className="text-stone-400">—</span>;
  const flat = Math.abs(value) < 10 ** -dp / 2;
  const good = flat ? null : (value > 0) === goodWhenUp;
  const cls = good == null ? "text-stone-500" : good ? "text-emerald-700" : "text-red-600";
  return (
    <span className={`font-medium tabular-nums ${cls}`}>
      {flat ? "±" : value > 0 ? "▲ " : "▼ "}
      {Math.abs(value).toFixed(dp)}
      {suffix}
    </span>
  );
}

export function marginTone(pct: number | null, target: number): StatusKey {
  if (pct == null) return "neutral";
  if (pct >= target) return "good";
  if (pct >= target - 5) return "warning";
  return "critical";
}

// Margin as a bar against the target (the tick): the FM-style attribute bar.
export function MarginBar({ pct, target }: { pct: number | null; target: number }) {
  if (pct == null) return <span className="text-xs text-stone-400">No cost yet</span>;
  const { color } = STATUS_COLORS[marginTone(pct, target)];
  const w = Math.max(0, Math.min(100, pct));
  return (
    <div className="relative h-2 w-28 rounded-sm bg-stone-100" role="img" aria-label={`${pct.toFixed(1)}% against a ${target}% target`}>
      <div className="h-2 rounded-sm" style={{ width: `${w}%`, backgroundColor: color }} />
      <div aria-hidden className="absolute -top-0.5 h-3 w-0.5 bg-stone-700" style={{ left: `${target}%` }} />
    </div>
  );
}

// A small line with its area, coloured by direction.
export function Spark({ values, width = 84, height = 22, goodWhenUp = true }: { values: number[]; width?: number; height?: number; goodWhenUp?: boolean }) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  // One point, or a line that never moved: say so rather than draw a flat line.
  if (values.length < 2 || max - min < 1e-9) return <span className="text-[11px] text-stone-400">{values.length < 2 ? "no history yet" : "steady"}</span>;
  const range = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * width, height - 2 - ((v - min) / range) * (height - 4)]);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const change = values[values.length - 1] - values[0];
  const color = Math.abs(change) < 1e-9 ? "#78716c" : (change > 0) === goodWhenUp ? "#059669" : "#dc2626";
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className="overflow-visible">
      <path d={`${line} L${width},${height} L0,${height} Z`} fill={color} opacity="0.08" />
      <path d={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2" fill={color} />
    </svg>
  );
}

export function HBar({ share, color = "#d97706" }: { share: number; color?: string }) {
  return (
    <div className="h-1.5 w-full rounded-sm bg-stone-100">
      <div className="h-1.5 rounded-sm" style={{ width: `${Math.max(2, Math.min(100, share * 100))}%`, backgroundColor: color }} />
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-3 py-6 text-center text-sm text-stone-500">{children}</p>;
}

export const money = (n: number | null | undefined, dp = 2) => (n == null ? "—" : `$${n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`);
export const unitMoney = (n: number | null | undefined) => (n == null ? "—" : `$${n.toFixed(n < 1 ? 4 : 2)}`);
