export function TrendArrow({ pct }: { pct: number }) {
  const up = pct > 0;
  return (
    <span className="inline-flex items-center gap-1 text-sm font-medium text-zinc-700">
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        aria-hidden
        style={{ transform: up ? undefined : "rotate(180deg)" }}
      >
        <path d="M6 1 L11 8 L7 8 L7 11 L5 11 L5 8 L1 8 Z" fill="currentColor" />
      </svg>
      {up ? "+" : ""}
      {pct.toFixed(1)}%
    </span>
  );
}
