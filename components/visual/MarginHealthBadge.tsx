// Status colors are the dataviz skill's fixed, pre-validated status palette
// (references/palette.md) — reused verbatim, not re-derived, so no need to
// re-run the palette validator. They always ship with an icon + label, never
// color alone.
const STATUS = {
  good: { color: "#0ca30c", bg: "#eafbea", label: "On target" },
  warning: { color: "#fab219", bg: "#fff8e6", label: "Watch" },
  critical: { color: "#d03b3b", bg: "#fdecec", label: "Below target" },
} as const;

export type MarginStatus = keyof typeof STATUS;

export function classifyMargin(marginPct: number | null, targetPct: number): MarginStatus {
  if (marginPct == null) return "critical";
  if (marginPct >= targetPct) return "good";
  if (marginPct >= targetPct - 5) return "warning";
  return "critical";
}

export function MarginHealthBadge({
  marginPct,
  targetPct,
}: {
  marginPct: number | null;
  targetPct: number;
}) {
  const status = classifyMargin(marginPct, targetPct);
  const { color, bg, label } = STATUS[status];

  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium"
      style={{ backgroundColor: bg, color }}
    >
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      {label}
      {marginPct != null && <span className="text-zinc-500">· {marginPct.toFixed(1)}%</span>}
    </span>
  );
}
