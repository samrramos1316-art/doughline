// The custom-order quote (docs: jewelry "custom-order quote calculator"):
// materials + labor + overhead, costed with the same formula as every
// build sheet (./recipeCost.ts), then priced at a target margin.
// Pure: no I/O, so it runs under `node --test` as is.
import { batchCost, marginPctOf, perServing, type BatchCost, type CostLine, type LaborOverhead } from "./recipeCost.ts";

// The price at which `cost` leaves `targetMarginPct` of the price as margin:
// cost ÷ (1 − margin). Rounded up to the cent, so the margin is never short.
// null when there's no cost yet or the margin isn't below 100%.
export function priceForMargin(cost: number | null, targetMarginPct: number): number | null {
  if (cost == null || !Number.isFinite(cost) || !(targetMarginPct < 100) || !(targetMarginPct >= 0)) return null;
  const price = cost / (1 - targetMarginPct / 100);
  return Math.ceil(price * 100 - 1e-9) / 100;
}

export type QuoteInput = {
  lines: CostLine[];
  laborOverhead: LaborOverhead;
  pieces: number; // how many the quote makes
  targetMarginPct: number;
  price?: number | null; // the owner's own price per piece, if they set one
};

export type Quote = {
  batch: BatchCost | null; // null: no lines, or a material without a price
  unpriced: number; // lines whose material has no price yet
  costPerPiece: number | null;
  suggestedPrice: number | null; // per piece, at the target margin
  marginAtPrice: number | null; // the owner's price's margin, %
};

export function quote(x: QuoteInput): Quote {
  const batch = batchCost(x.lines, x.laborOverhead);
  const costPerPiece = perServing(batch?.total ?? null, x.pieces);
  return {
    batch,
    unpriced: x.lines.filter((l) => l.unitCost == null).length,
    costPerPiece,
    suggestedPrice: priceForMargin(costPerPiece, x.targetMarginPct),
    marginAtPrice: x.price != null && x.price > 0 ? marginPctOf(x.price, costPerPiece) : null,
  };
}
