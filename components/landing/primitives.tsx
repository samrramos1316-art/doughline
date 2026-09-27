// Small presentational pieces for the marketing page's product mockups.

export function BrowserFrame({ url, children, className = "" }: { url: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-2xl border border-stone-900/10 bg-white shadow-[0_30px_80px_-20px_rgba(28,25,23,0.35)] ${className}`}>
      <div className="flex items-center gap-2 border-b border-stone-900/5 bg-stone-50/80 px-4 py-2.5">
        <span className="flex gap-1.5" aria-hidden>
          <span className="h-2.5 w-2.5 rounded-full bg-stone-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-stone-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-stone-300" />
        </span>
        <span className="mx-auto flex max-w-xs flex-1 items-center justify-center gap-1.5 rounded-md bg-white px-3 py-1 text-[11px] text-stone-400 ring-1 ring-stone-900/5">
          <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" aria-hidden>
            <path d="M3.5 5V3.8a2.5 2.5 0 0 1 5 0V5M3 5h6v4.5H3z" fill="none" stroke="currentColor" strokeWidth="1.2" />
          </svg>
          {url}
        </span>
        <span className="w-10" aria-hidden />
      </div>
      {children}
    </div>
  );
}

export function PhoneFrame({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative mx-auto w-[280px] rounded-[2.6rem] bg-stone-900 p-2.5 shadow-[0_40px_80px_-24px_rgba(28,25,23,0.5)] ${className}`}>
      <div className="absolute top-2.5 left-1/2 z-10 h-5 w-24 -translate-x-1/2 rounded-b-2xl bg-stone-900" aria-hidden />
      <div className="overflow-hidden rounded-[2.1rem] bg-[#faf8f5]">{children}</div>
    </div>
  );
}

// A static sparkline from a list of values (the marketing page plots real
// USDA series, downsampled).
export function Spark({
  values,
  width = 120,
  height = 32,
  stroke = "#2a78d6",
  fill = true,
  fluid = false,
}: {
  values: number[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: boolean;
  fluid?: boolean; // stretch to the container's width instead of a fixed size
}) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * width, height - 3 - ((v - min) / range) * (height - 6)]);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const id = `spark-${Math.round(values[0] * 1000)}-${values.length}-${stroke.slice(1)}`;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={fluid ? undefined : width}
      height={height}
      preserveAspectRatio={fluid ? "none" : undefined}
      aria-hidden
      className={fluid ? "block w-full overflow-visible" : "overflow-visible"}
    >
      {fill && (
        <>
          <defs>
            <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity="0.18" />
              <stop offset="100%" stopColor={stroke} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${line} L${width},${height} L0,${height} Z`} fill={`url(#${id})`} />
        </>
      )}
      <path d={line} fill="none" stroke={stroke} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      {!fluid && <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.2" fill={stroke} />}
    </svg>
  );
}

export function Check({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden>
      <circle cx="8" cy="8" r="8" fill="#1c1917" />
      <path d="m4.8 8.2 2.1 2.1 4.3-4.6" fill="none" stroke="#fbbf24" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ArrowRight({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden>
      <path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Eyebrow({ children, dark = false }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <p className={`text-xs font-semibold tracking-[0.18em] uppercase ${dark ? "text-amber-400" : "text-amber-700"}`}>{children}</p>
  );
}

// The same margin-health language the app uses (§10): green at/above target.
export function MarginPill({ pct, target = 65 }: { pct: number; target?: number }) {
  const good = pct >= target;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${good ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${good ? "bg-emerald-500" : "bg-rose-500"}`} />
      {pct.toFixed(2)}%
    </span>
  );
}
