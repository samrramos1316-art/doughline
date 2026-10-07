// §5.4: a small fixed conversion table for common units — mass, volume,
// count, length — not general unit conversion. Each unit maps to a factor in
// its dimension's reference unit (g, ml, each, m). A factor of null means the
// size differs per ingredient (a bunch of tulips vs a bunch of eucalyptus):
// it converts only when the caller passes that ingredient's size.
// `container`: a piece whose contents vary (a bunch of cilantro, a sheet of
// pastry) — handled like a bag or a case below, as these were before they
// were in this table.
type Dim = "mass" | "volume" | "count" | "length";
const UNITS: Record<string, { dim: Dim; factor: number | null; container?: true }> = {
  g: { dim: "mass", factor: 1 },
  kg: { dim: "mass", factor: 1000 },
  oz: { dim: "mass", factor: 28.349523125 },
  lb: { dim: "mass", factor: 453.59237 },
  ml: { dim: "volume", factor: 1 },
  l: { dim: "volume", factor: 1000 },
  tsp: { dim: "volume", factor: 4.92892159375 },
  tbsp: { dim: "volume", factor: 14.78676478125 },
  cup: { dim: "volume", factor: 236.5882365 },
  "fl oz": { dim: "volume", factor: 29.5735295625 },
  pt: { dim: "volume", factor: 473.176473 },
  qt: { dim: "volume", factor: 946.352946 },
  gal: { dim: "volume", factor: 3785.411784 },
  each: { dim: "count", factor: 1 },
  dozen: { dim: "count", factor: 12 },
  // Precious metals (jewelry): troy weights, exact by definition.
  "troy oz": { dim: "mass", factor: 31.1034768 },
  dwt: { dim: "mass", factor: 1.55517384 },
  carat: { dim: "mass", factor: 0.2 }, // gemstones; "ct" stays a count (food invoices use it that way)
  // Flowers and sheet goods are counted.
  stem: { dim: "count", factor: 1, container: true },
  bunch: { dim: "count", factor: null, container: true }, // stems per bunch: per ingredient
  sheet: { dim: "count", factor: 1, container: true },
  // Length (wire, chain, stock).
  in: { dim: "length", factor: 0.0254 },
  cm: { dim: "length", factor: 0.01 },
  ft: { dim: "length", factor: 0.3048 },
  m: { dim: "length", factor: 1 },
};

const ALIASES: Record<string, string> = {
  "#": "lb", lbs: "lb", pound: "lb", pounds: "lb",
  gram: "g", grams: "g", kilogram: "kg", kilograms: "kg",
  ounce: "oz", ounces: "oz",
  liter: "l", liters: "l", litre: "l", litres: "l",
  floz: "fl oz", "fl. oz": "fl oz", "fl oz.": "fl oz",
  pint: "pt", pints: "pt", quart: "qt", quarts: "qt", gallon: "gal", gallons: "gal",
  cups: "cup", teaspoon: "tsp", tablespoon: "tbsp",
  ea: "each", ct: "each", count: "each", pc: "each", pcs: "each", piece: "each", pieces: "each",
  dz: "dozen", doz: "dozen",
  "troy ounce": "troy oz", "troy ounces": "troy oz", ozt: "troy oz", "oz t": "troy oz", "t oz": "troy oz", "oz troy": "troy oz",
  pennyweight: "dwt", pennyweights: "dwt", carats: "carat",
  stems: "stem", bunches: "bunch", bn: "bunch", sheets: "sheet",
  inch: "in", inches: "in", foot: "ft", feet: "ft",
  meter: "m", meters: "m", metre: "m", metres: "m",
  centimeter: "cm", centimeters: "cm", centimetre: "cm", centimetres: "cm",
};

export function canonicalUnit(unit: string | null | undefined): string | null {
  if (!unit) return null;
  const u = unit.trim().toLowerCase().replace(/\s+/g, " ");
  if (u in UNITS) return u;
  return ALIASES[u] ?? null;
}

// Kitchen units compare by canonical form; anything else (case, bag, flat,
// tub…) by its lowercased singular, so "Cases" on an invoice is the same
// unit as an ingredient costed per "case".
function unitKey(unit: string | null | undefined): string | null {
  if (!unit) return null;
  const canonical = canonicalUnit(unit);
  if (canonical) return canonical;
  const u = unit.trim().toLowerCase().replace(/\.$/, "").replace(/\s+/g, " ");
  if (!u) return null;
  if (/(ch|sh|x|ss)es$/.test(u)) return u.slice(0, -2); // boxes → box
  if (u.endsWith("s") && !u.endsWith("ss")) return u.slice(0, -1); // cases → case
  return u;
}

// Bought and costed per container (bag, case, flat, bunch, sheet…): priced
// as printed when the invoice uses the same unit, and converted to by the
// pack size an invoice printed for it.
export function isContainerUnit(unit: string | null | undefined): boolean {
  const c = canonicalUnit(unit);
  return c ? UNITS[c].container === true : unitKey(unit) != null;
}

export function sameUnit(a: string | null | undefined, b: string | null | undefined): boolean {
  const ka = unitKey(a);
  return ka != null && ka === unitKey(b);
}

// Per-ingredient sizes for units without a fixed one, in their dimension's
// reference unit: { bunch: 10 } = 10 stems (each) to a bunch.
export type UnitSizes = Partial<Record<string, number>>;

// How many `to` are in one `from` (lb → oz = 16), or null if either unit is
// unknown, they measure different things (a case of lb is not in gallons),
// or one has no fixed size and `sizes` doesn't give it.
export function conversionFactor(from: string | null | undefined, to: string | null | undefined, sizes?: UnitSizes): number | null {
  const f = canonicalUnit(from);
  const t = canonicalUnit(to);
  if (!f || !t) return null;
  if (UNITS[f].dim !== UNITS[t].dim) return null;
  if (f === t) return 1;
  const ff = UNITS[f].factor ?? sizes?.[f];
  const tf = UNITS[t].factor ?? sizes?.[t];
  if (!ff || !tf) return null;
  return ff / tf;
}

export type BaseUnitCost = { ok: true; cost: number; basis: string } | { ok: false; note: string };

// An invoice price is per *invoice unit* (a 50# bag, a 36/1# case); recipes
// and margins are costed per ingredient.base_unit. Convert:
//   1. sold by weight/volume (unit LB, GAL…) → divide by that unit's factor
//   2. else the printed pack size (a case of 36 lb) → divide by pack × factor.
//      Pack wins over a count unit: "EA" on an invoice usually means one
//      invoice unit (one 15-dozen case), not one egg.
//   3. else a bare count unit (DZ, EA) with no pack → divide by its factor
//   4. else it can't be done safely — the caller records why and leaves the cost alone.
export function toBaseUnitCost(
  line: {
    unit_cost: number | null;
    unit: string | null;
    pack_quantity: number | null;
    pack_unit: string | null;
  },
  baseUnit: string,
): BaseUnitCost {
  if (line.unit_cost == null) return { ok: false, note: "No unit cost on the invoice line" };

  const unitCost = line.unit_cost;
  const direct = conversionFactor(line.unit, baseUnit);
  const unitDim = UNITS[canonicalUnit(line.unit) ?? ""]?.dim;
  const byDirect = (factor: number): BaseUnitCost => ({
    ok: true,
    cost: round4(unitCost / factor),
    basis: `$${unitCost} per ${line.unit}`,
  });
  if (isContainerUnit(line.unit) && sameUnit(line.unit, baseUnit)) return { ok: true, cost: round4(unitCost), basis: `$${unitCost} per ${line.unit}` };
  if (direct && unitDim !== "count") return byDirect(direct);

  const packFactor = conversionFactor(line.pack_unit, baseUnit);
  if (line.pack_quantity && line.pack_quantity > 0 && packFactor) {
    const baseQty = line.pack_quantity * packFactor;
    return {
      ok: true,
      cost: round4(unitCost / baseQty),
      basis: `$${unitCost} per ${line.unit ?? "unit"} of ${line.pack_quantity} ${line.pack_unit} = ${round4(baseQty)} ${baseUnit}`,
    };
  }

  if (direct) return byDirect(direct);

  const what = line.pack_quantity && line.pack_unit ? `${line.pack_quantity} ${line.pack_unit}` : `"${line.unit ?? "?"}"`;
  return { ok: false, note: `Can't convert ${what} to ${baseUnit} — price not applied` };
}

function round4(n: number) {
  return Math.round(n * 10000) / 10000;
}
