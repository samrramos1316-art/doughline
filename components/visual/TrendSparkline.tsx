// Sequential-hue blue from the dataviz skill's validated default palette
// (references/palette.md) — a single trend line, not a magnitude ramp, but
// this is the palette's designated "one series" hue and is reused verbatim.
const LINE_COLOR_LIGHT = "#2a78d6";
const LINE_COLOR_DARK = "#3987e5";

export type TrendPoint = { date: string; value: number };

export function TrendSparkline({
  points,
  width = 96,
  height = 28,
}: {
  points: TrendPoint[];
  width?: number;
  height?: number;
}) {
  if (points.length < 2) {
    return (
      <div style={{ width, height }} className="flex items-center text-xs text-zinc-400">
        Not enough data yet
      </div>
    );
  }

  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = width / (points.length - 1);

  const coords = points.map((p, i) => {
    const x = i * stepX;
    const y = height - ((p.value - min) / range) * height;
    return [x, y] as const;
  });

  const path = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const [lastX, lastY] = coords[coords.length - 1];
  const title = `Margin trend: ${points.map((p) => `${p.date} ${p.value.toFixed(1)}%`).join(", ")}`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title}>
      <title>{title}</title>
      <path
        d={path}
        fill="none"
        stroke={LINE_COLOR_LIGHT}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="dark:hidden"
      />
      <path
        d={path}
        fill="none"
        stroke={LINE_COLOR_DARK}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="hidden dark:block"
      />
      <circle cx={lastX} cy={lastY} r={2.5} fill={LINE_COLOR_LIGHT} className="dark:hidden" />
      <circle cx={lastX} cy={lastY} r={2.5} fill={LINE_COLOR_DARK} className="hidden dark:block" />
    </svg>
  );
}
