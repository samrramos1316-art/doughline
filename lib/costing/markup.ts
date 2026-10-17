// Pricing by markup (docs: jewelry "markup views for owners who price by
// multiplier, e.g. keystone 2x"). A multiplier is a margin said another way:
// price = cost × M keeps 1 − 1/M of the price (2× = 50%, 3× = 66.67%).
// organizations.target_markup (migration 030) holds the owner's multiplier
// exactly; target_margin_pct keeps its margin, rounded, for older readers.
// Everything that prices at the target goes through targetMarginOf, so 3×
// prices at exactly 3× rather than at a rounded 66.67%.
// Pure: no I/O, so it runs under `node --test` as is.

export type TargetSettings = { target_margin_pct: number | string | null; target_markup?: number | string | null };

export function markupValue(org: TargetSettings): number | null {
  const m = Number(org.target_markup);
  return org.target_markup != null && Number.isFinite(m) && m > 1 ? m : null;
}

// The margin % to price at: the multiplier's exact margin, else the margin.
export function targetMarginOf(org: TargetSettings | null | undefined, fallback = 65): number {
  if (!org) return fallback;
  const m = markupValue(org);
  if (m != null) return marginFromMarkup(m);
  const pct = Number(org.target_margin_pct);
  return org.target_margin_pct != null && Number.isFinite(pct) ? pct : fallback;
}

export function marginFromMarkup(markup: number): number {
  return (1 - 1 / markup) * 100;
}

export function markupFromMargin(marginPct: number): number | null {
  return marginPct < 100 ? 1 / (1 - marginPct / 100) : null;
}

// Price ÷ cost: what an owner who prices by multiplier reads.
export function markupOf(price: number | null | undefined, cost: number | null | undefined): number | null {
  if (price == null || cost == null || !(cost > 0) || !(price > 0)) return null;
  return price / cost;
}

// "2×", "2.5×", "2.25×": up to two decimals, no trailing zeros.
export function formatMarkup(m: number | null | undefined): string {
  if (m == null || !Number.isFinite(m)) return "—";
  return `${Number(m.toFixed(2))}×`;
}

// A margin %, at most one decimal: 65 → "65%", 66.666… → "66.7%".
export function formatMarginPct(pct: number): string {
  return `${Number(pct.toFixed(1))}%`;
}

// The target as the owner set it: "65%" or "2× markup".
export function targetLabel(org: TargetSettings | null | undefined, fallback = 65): string {
  const m = org ? markupValue(org) : null;
  return m != null ? `${formatMarkup(m)} markup` : formatMarginPct(targetMarginOf(org, fallback));
}
