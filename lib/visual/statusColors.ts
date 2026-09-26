// Single source of truth for status colors across the app — the dataviz
// skill's fixed, pre-validated status palette (references/palette.md),
// plus a neutral gray for non-evaluative states (pending, acknowledged).
// Reused verbatim; never re-derived per component. Every use pairs color
// with an icon dot + text label — color never carries meaning alone.
export const STATUS_COLORS = {
  good: { color: "#0ca30c", bg: "#eafbea" },
  warning: { color: "#fab219", bg: "#fff8e6" },
  serious: { color: "#ec835a", bg: "#fdf1ea" },
  critical: { color: "#d03b3b", bg: "#fdecec" },
  neutral: { color: "#6b7280", bg: "#f4f4f5" },
} as const;

export type StatusKey = keyof typeof STATUS_COLORS;
