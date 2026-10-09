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

// An event or wedding quote (docs: florist "event quote bundle"): several
// arrangements, each at its live cost per piece (its own materials,
// spoilage, labor and overhead), times how many, plus what the event adds —
// delivery, setup time, anything else — priced at a target margin.
export type EventItem = { name: string; quantity: number; costEach: number | null };

export type EventQuoteInput = {
  items: EventItem[];
  delivery?: number | null; // $ for the event
  setupMinutes?: number | null; // on-site setup / breakdown time
  laborRatePerHour?: number | null;
  otherCosts?: number | null; // $: rentals, permits, anything not in an arrangement
  targetMarginPct: number;
  price?: number | null; // the owner's own total, if they set one
};

export type EventQuote = {
  arrangements: number | null; // Σ quantity × cost each; null while any is unknown
  unpriced: string[]; // arrangements without a cost yet
  setupLabor: number;
  extras: number; // delivery + other costs
  totalCost: number | null;
  suggestedPrice: number | null; // for the whole event, at the target margin
  marginAtPrice: number | null;
};

const money0 = (n: number | null | undefined) => (n != null && Number.isFinite(n) && n > 0 ? n : 0);

export function eventQuote(x: EventQuoteInput): EventQuote {
  const items = x.items.filter((i) => i.quantity > 0);
  const unpriced = items.filter((i) => i.costEach == null).map((i) => i.name);
  const arrangements = items.length && !unpriced.length ? items.reduce((s, i) => s + i.quantity * i.costEach!, 0) : null;
  const setupLabor = (money0(x.setupMinutes) * money0(x.laborRatePerHour)) / 60;
  const extras = money0(x.delivery) + money0(x.otherCosts);
  const totalCost = arrangements == null ? null : arrangements + setupLabor + extras;
  return {
    arrangements,
    unpriced,
    setupLabor,
    extras,
    totalCost,
    suggestedPrice: priceForMargin(totalCost, x.targetMarginPct),
    marginAtPrice: x.price != null && x.price > 0 ? marginPctOf(x.price, totalCost) : null,
  };
}
