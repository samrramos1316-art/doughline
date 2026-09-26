import { STATUS_COLORS, type StatusKey } from "@/lib/visual/statusColors";

const LABELS: Record<"good" | "warning" | "critical", string> = {
  good: "On target",
  warning: "Watch",
  critical: "Below target",
};

export type MarginStatus = keyof typeof LABELS;

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
  const status: StatusKey = classifyMargin(marginPct, targetPct);
  const { color, bg } = STATUS_COLORS[status];
  const label = LABELS[status as keyof typeof LABELS];

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
