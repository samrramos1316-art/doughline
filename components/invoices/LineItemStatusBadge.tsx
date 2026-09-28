import { STATUS_COLORS, type StatusKey } from "@/lib/visual/statusColors";

const STATUS_MAP: Record<string, { key: StatusKey; label: string }> = {
  pending: { key: "neutral", label: "Pending" },
  auto_matched: { key: "good", label: "Matched" },
  confirmed: { key: "good", label: "Confirmed" },
  needs_review: { key: "warning", label: "Needs review" },
  new_ingredient: { key: "serious", label: "New ingredient?" },
  rejected: { key: "critical", label: "Rejected" },
  not_ingredient: { key: "neutral", label: "Not an ingredient" },
};

export function LineItemStatusBadge({ status }: { status: string }) {
  const entry = STATUS_MAP[status] ?? STATUS_MAP.pending;
  const { color, bg } = STATUS_COLORS[entry.key];

  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium"
      style={{ backgroundColor: bg, color }}
    >
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      {entry.label}
    </span>
  );
}
