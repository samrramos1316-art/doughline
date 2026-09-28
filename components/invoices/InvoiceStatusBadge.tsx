import { STATUS_COLORS, type StatusKey } from "@/lib/visual/statusColors";

const STATUS_MAP: Record<string, { key: StatusKey; label: string }> = {
  pending: { key: "neutral", label: "Pending" },
  processing: { key: "neutral", label: "Processing" },
  needs_review: { key: "warning", label: "Needs review" },
  completed: { key: "good", label: "Completed" },
  failed: { key: "critical", label: "Failed" },
};

export function InvoiceStatusBadge({ status }: { status: string }) {
  const entry = STATUS_MAP[status] ?? STATUS_MAP.pending;
  const { color, bg } = STATUS_COLORS[entry.key];

  return (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-semibold"
      style={{ backgroundColor: bg, color }}
    >
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      {entry.label}
    </span>
  );
}
