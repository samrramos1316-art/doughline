// Worked examples for the marketing pages: one supplier price moves, and
// this is what it does to one product's margin. The numbers are made up
// (plausible, labelled "example" wherever shown) but the arithmetic is the
// app's own: lib/costing/recipeCost.ts for cost, lib/suggestions/math.ts for
// the price that restores the margin. Pure, so it runs under `node --test`.
import { batchCost, marginPctOf, type CostLine } from "../costing/recipeCost.ts";
import { suggestForItem } from "../suggestions/math.ts";
import type { IndustryId } from "./index.ts";

export type WorkedExample = {
  id: string;
  industry: IndustryId; // whose wording and page it belongs to
  tab: string; // the toggle's label
  product: string; // what's sold
  price: number; // selling price of one
  perBatch: number; // how many one batch / build / arrangement makes
  moved: { name: string; unit: string; from: number; to: number; qty: number; wastePct?: number };
  rest: { name: string; cost: number }[]; // everything else in the batch, per batch
  labor?: { minutes: number; ratePerHour: number };
  invoiceLine: string; // how the moved line looks on the supplier's invoice
};

export const EXAMPLES: WorkedExample[] = [
  {
    // The landing page's butter story (components/landing/Landing.tsx CHAIN):
    // 36 lb case at $142.56 = $3.96/lb, was $3.40; croissant 88.64% → 87.35%.
    id: "croissant",
    industry: "bakery",
    tab: "Bakery",
    product: "Croissant",
    price: 4.5,
    perBatch: 12,
    moved: { name: "Butter", unit: "lb", from: 3.4, to: 3.96, qty: 1.25 },
    rest: [{ name: "Flour, eggs, milk and the rest", cost: 1.8828 }],
    invoiceLine: "BUTTER SWT UNSLTD 36/1# · $142.56",
  },
  {
    id: "ring",
    industry: "jewelry",
    tab: "Jeweler",
    product: "Sterling stacking ring",
    price: 95,
    perBatch: 1,
    moved: { name: "Sterling silver", unit: "g", from: 1.0, to: 1.2, qty: 8, wastePct: 5 },
    rest: [{ name: "Stone and finding", cost: 6 }],
    labor: { minutes: 45, ratePerHour: 24 },
    invoiceLine: "STERLING CASTING GRAIN 5 OZT · $186.62",
  },
  {
    id: "arrangement",
    industry: "florist",
    tab: "Florist",
    product: "Dozen-rose arrangement",
    price: 75,
    perBatch: 1,
    moved: { name: "Red roses", unit: "stem", from: 1.1, to: 1.45, qty: 12, wastePct: 10 },
    rest: [
      { name: "Greens", cost: 3 },
      { name: "Vase", cost: 6 },
    ],
    labor: { minutes: 20, ratePerHour: 18 },
    invoiceLine: "ROSE RED FREEDOM 50CM 25ST · $36.25",
  },
];

export type ExampleResult = {
  costBefore: number; // per item
  costAfter: number;
  marginBefore: number; // %
  marginAfter: number;
  priceMovePct: number; // of the moved supply
  fixPrice: number | null; // the price that gets the old margin back
};

export function workExample(x: WorkedExample): ExampleResult {
  const cost = (unitCost: number) => {
    const lines: CostLine[] = [
      { quantity: x.moved.qty, unitCost, wastePct: x.moved.wastePct ?? 0 },
      ...x.rest.map((r) => ({ quantity: 1, unitCost: r.cost })),
    ];
    const b = batchCost(lines, { laborMinutes: x.labor?.minutes ?? 0, laborRatePerHour: x.labor?.ratePerHour ?? null });
    return b!.total / x.perBatch;
  };
  const costBefore = cost(x.moved.from);
  const costAfter = cost(x.moved.to);
  const marginBefore = marginPctOf(x.price, costBefore)!;
  const marginAfter = marginPctOf(x.price, costAfter)!;
  // Goal = the margin it had (target 0 so "restore the previous margin" wins).
  const s = suggestForItem({
    sellingPrice: x.price,
    costPerServing: costAfter,
    servingsPerBatch: x.perBatch,
    previousMarginPct: marginBefore,
    targetMarginPct: 0,
    ingredientQtyPerBatch: x.moved.qty,
    ingredientUnitCost: x.moved.to,
    baseUnit: x.moved.unit,
  });
  return {
    costBefore,
    costAfter,
    marginBefore,
    marginAfter,
    priceMovePct: Math.round(((x.moved.to - x.moved.from) / x.moved.from) * 1000) / 10,
    fixPrice: s.raise_price?.new_price ?? null,
  };
}

export const exampleFor = (industry: IndustryId) => EXAMPLES.find((e) => e.industry === industry);
