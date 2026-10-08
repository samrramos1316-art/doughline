// Industry profiles: the single source of truth for what changes per
// organizations.business_type — the words, unit and category suggestions,
// costing defaults, market series and the vision-prompt hints. The schema,
// routes and cost formula are the same for every industry.
//
// Which industries a new business can pick is set by ENABLED_INDUSTRIES
// (./gate.ts), not here: `status` says how far along a profile is. An org
// whose industry isn't offered any more keeps its profile in full.
//
// Pure (relative imports only), so it runs under `node --test`.
import { CATEGORY_DEFAULTS } from "../market/categoryDefaults.ts";

export const INDUSTRY_IDS = ["bakery", "food_truck", "caterer", "jewelry", "florist", "metalworking", "other"] as const;
export type IndustryId = (typeof INDUSTRY_IDS)[number];

export type Vocab = {
  recipe: string;
  recipes: string;
  menuItem: string;
  menuItems: string;
  menu: string; // the /menu page and its nav link
  ingredient: string;
  ingredients: string;
  yield: string; // "Batch makes" — what one recipe produces
  serving: string; // one of what a batch makes, mid-sentence: "cost per serving"
  servings: string;
  onMenu: string; // mid-sentence: "not on the menu yet"
  yieldExample: string; // the new-recipe form's "Of what" placeholder
};
export const VOCAB_KEYS = ["recipe", "recipes", "menuItem", "menuItems", "menu", "ingredient", "ingredients", "yield", "serving", "servings", "onMenu", "yieldExample"] as const satisfies readonly (keyof Vocab)[];

export type MarketSeries = {
  code: string;
  label: string;
  // false = a placeholder: nothing fetches this series yet (lib/market/ingest.ts
  // only knows USDA and FAO food series). Market Watch stays hidden for an
  // industry until one of its series is ingesting.
  ingesting: boolean;
};

export type ExtractionKind = "invoice" | "menu" | "recipe";

export type IndustryProfile = {
  id: IndustryId;
  name: string; // as offered in the signup / settings picker
  description: string;
  family: "food" | "trade"; // food = today's DoughTally; its screens keep their own suggestion lists
  status: "live" | "beta" | "hidden";
  vocab: Vocab;
  units: string[]; // allowed/suggested units, all known to lib/costing/units.ts
  categories: string[]; // suggested ingredient categories (stored as written)
  defaults: {
    default_waste_pct: number; // new materials start with this waste % (migration 027)
    default_overhead_pct: number;
    show_labor_by_default: boolean; // the recipe page's Labor & overhead section starts open
  };
  // Screens only some industries get. quote: the custom-order quote
  // calculator (/quote), for one-off pieces priced from materials + labor.
  features: { quote: boolean };
  market: {
    categoryDefaults: Record<string, string>; // category → commodity_code
    series: MarketSeries[];
  };
  // Appended to the vision prompts (lib/industries/extraction.ts). Empty for
  // food: the base prompts were written for food businesses.
  extraction: Record<ExtractionKind, string>;
};

const FOOD_VOCAB: Vocab = {
  recipe: "Recipe",
  recipes: "Recipes",
  menuItem: "Menu item",
  menuItems: "Menu items",
  menu: "Menu",
  ingredient: "Ingredient",
  ingredients: "Ingredients",
  yield: "Batch makes",
  serving: "serving",
  servings: "servings",
  onMenu: "on the menu",
  yieldExample: "cookies",
};

// The spec's food list plus gal and qt, which food screens offer today and
// invoices use for dairy and oil.
const FOOD_UNITS = ["g", "kg", "oz", "lb", "ml", "l", "tsp", "tbsp", "cup", "fl oz", "gal", "qt", "each", "dozen", "case"];
const FOOD_CATEGORIES = ["dairy", "dry_goods", "produce", "protein", "packaging", "beverage", "frozen"];
const FOOD_SERIES: MarketSeries[] = [
  { code: "eggs_large_white", label: "Eggs, large white (US wholesale)", ingesting: true },
  { code: "butter", label: "Butter (CME)", ingesting: true },
  { code: "wheat", label: "Wheat", ingesting: true },
  { code: "fao_food_price_index", label: "Food prices overall (FAO index)", ingesting: true },
  { code: "fao_meat_index", label: "Meat (FAO index)", ingesting: true },
  { code: "fao_dairy_index", label: "Dairy (FAO index)", ingesting: true },
  { code: "fao_cereals_index", label: "Cereals (FAO index)", ingesting: true },
  { code: "fao_oils_index", label: "Vegetable oils (FAO index)", ingesting: true },
  { code: "fao_sugar_index", label: "Sugar (FAO index)", ingesting: true },
];
const NO_HINTS: Record<ExtractionKind, string> = { invoice: "", menu: "", recipe: "" };

const food = (id: IndustryId, name: string, description: string): IndustryProfile => ({
  id,
  name,
  description,
  family: "food",
  status: "live",
  vocab: FOOD_VOCAB,
  units: FOOD_UNITS,
  categories: FOOD_CATEGORIES,
  defaults: { default_waste_pct: 0, default_overhead_pct: 0, show_labor_by_default: false },
  features: { quote: false },
  market: { categoryDefaults: CATEGORY_DEFAULTS, series: FOOD_SERIES },
  extraction: NO_HINTS,
});

// Shared by every trade profile's invoice hints.
const SEPARATE_CHARGES =
  "Keep surcharges (metal, fuel, energy), freight, shipping, handling and cutting/setup charges as their own line items with their own amounts — do not fold them into the product lines and do not skip them.";

export const INDUSTRIES: Record<IndustryId, IndustryProfile> = {
  bakery: food("bakery", "Home bakery", "Bread, cakes, cookies and pastry made in batches."),
  food_truck: food("food_truck", "Food truck", "A short menu cooked to order from prepped batches."),
  caterer: food("caterer", "Caterer", "Event menus priced per head or per tray."),
  other: food("other", "Other", "Any other business; uses the food wording."),

  jewelry: {
    id: "jewelry",
    name: "Jewelry maker",
    description: "Pieces built from precious metal, stones and findings.",
    family: "trade",
    status: "hidden",
    vocab: {
      recipe: "Build sheet",
      recipes: "Build sheets",
      menuItem: "Product",
      menuItems: "Products",
      menu: "Products",
      ingredient: "Material",
      ingredients: "Materials",
      yield: "Build makes",
      serving: "piece",
      servings: "pieces",
      onMenu: "for sale",
      yieldExample: "rings",
    },
    // Stones are counted (each) or weighed in carats; chain is bought by length.
    units: ["g", "dwt", "troy oz", "carat", "each", "in", "cm"],
    // outsourced_work: casting, plating, stone setting bought in per piece.
    categories: ["precious_metal", "stone", "finding", "chain", "outsourced_work", "packaging", "tools_consumables"],
    defaults: { default_waste_pct: 5, default_overhead_pct: 0, show_labor_by_default: true },
    features: { quote: true },
    market: {
      categoryDefaults: { precious_metal: "gold_spot" },
      series: [
        { code: "gold_spot", label: "Gold spot price (placeholder)", ingesting: false },
        { code: "silver_spot", label: "Silver spot price (placeholder)", ingesting: false },
        { code: "platinum_spot", label: "Platinum spot price (placeholder)", ingesting: false },
      ],
    },
    extraction: {
      invoice: `This business makes jewelry, not food. Its suppliers are metal refiners and casting houses, stone dealers, and findings/chain wholesalers.
- Metal is sold by weight: grams (g), pennyweight (dwt) or troy ounces (ozt, "t oz") — never avoirdupois oz unless printed so. Use unit "dwt" or "troy oz" as printed.
- Gemstones are sold per stone (unit "each") or by carat weight; "ct" or "cttw" on a stone line means carats — use unit "carat", not a count.
- Chain and wire are sold by length (in, ft, cm) or by weight.
- item_name: the plain material, e.g. "14k yellow gold casting grain", "sterling silver jump rings 4mm", "round white sapphire 3mm".
- ${SEPARATE_CHARGES}`,
      menu: `This business makes jewelry: the "menu" is a price list or product catalog of finished pieces (rings, pendants, earrings). Each product with its retail price is an item.`,
      recipe: `This business makes jewelry: the "recipe" is a build sheet or bill of materials for one piece or a run of pieces. Lines are materials (metal by weight in g/dwt, stones by count or carat, findings and chain by count or length). The yield is the number of pieces the sheet makes.`,
    },
  },

  florist: {
    id: "florist",
    name: "Florist",
    description: "Arrangements and event packages from cut flowers and supplies.",
    family: "trade",
    status: "hidden",
    vocab: {
      recipe: "Arrangement",
      recipes: "Arrangements",
      menuItem: "Package",
      menuItems: "Packages",
      menu: "Packages",
      ingredient: "Stem or supply",
      ingredients: "Stems & supplies",
      yield: "Arrangement makes",
      serving: "arrangement",
      servings: "arrangements",
      onMenu: "for sale",
      yieldExample: "bouquets",
    },
    units: ["stem", "bunch", "each", "ft", "in"],
    categories: ["cut_flower", "greens", "vase_container", "foam_supplies", "ribbon_packaging"],
    defaults: { default_waste_pct: 10, default_overhead_pct: 0, show_labor_by_default: true },
    features: { quote: false },
    market: {
      categoryDefaults: { cut_flower: "floral_wholesale" },
      series: [{ code: "floral_wholesale", label: "Wholesale cut flowers (placeholder)", ingesting: false }],
    },
    extraction: {
      invoice: `This business is a florist, not a food business. Its suppliers are flower wholesalers, growers and floral-supply houses.
- Flowers are sold by the stem, by the bunch (often 10 or 25 stems) or by the box/case; record the unit as printed ("stem", "bunch"), and a printed stems-per-bunch or stems-per-box count as pack_quantity with pack_unit "stem".
- Ribbon is sold by the yard/foot or by the roll; containers, foam and supplies by each or by case.
- item_name: the plain flower or supply with its variety and length, e.g. "red rose 50cm", "eucalyptus silver dollar", "floral foam brick".
- ${SEPARATE_CHARGES}`,
      menu: `This business is a florist: the "menu" is a price list of arrangements, bouquets or event packages. Each one with its price is an item.`,
      recipe: `This business is a florist: the "recipe" is an arrangement recipe — stems and supplies for one design. Lines are flowers by stem or bunch, greens, containers, foam and ribbon. The yield is how many arrangements it makes.`,
    },
  },

  metalworking: {
    id: "metalworking",
    name: "Metal fabrication",
    description: "Jobs and quotes built from bar, sheet and tube stock.",
    family: "trade",
    status: "hidden",
    vocab: {
      recipe: "Job",
      recipes: "Jobs",
      menuItem: "Quote",
      menuItems: "Quotes",
      menu: "Quotes",
      ingredient: "Material",
      ingredients: "Materials",
      yield: "Job makes",
      serving: "part",
      servings: "parts",
      onMenu: "quoted",
      yieldExample: "brackets",
    },
    units: ["kg", "lb", "ft", "in", "m", "sheet", "each"],
    categories: ["bar_stock", "sheet_plate", "tube_pipe", "fasteners", "consumables", "finishing_coating", "outsourced_service"],
    defaults: { default_waste_pct: 8, default_overhead_pct: 0, show_labor_by_default: true },
    features: { quote: false },
    market: {
      categoryDefaults: { sheet_plate: "steel_hrc", bar_stock: "steel_hrc" },
      series: [
        { code: "steel_hrc", label: "Hot-rolled steel coil (placeholder)", ingesting: false },
        { code: "aluminum", label: "Aluminum (placeholder)", ingesting: false },
      ],
    },
    extraction: {
      invoice: `This business is a metal fabrication shop, not a food business. Its suppliers are metal service centers, fastener and welding-supply distributors, and outside finishers (powder coat, plating).
- Stock is sold by length (ft, in, m — "20' LG" is 20 ft), by the sheet or plate, or by weight (lb, kg, "CWT" = per 100 lb). Record the unit as printed; a printed length or weight per piece is pack_quantity/pack_unit.
- Descriptions are dense codes: alloy and temper ("A36", "6061-T6", "304 SS"), shape ("FB" flat bar, "RB" round bar, "SQ TUBE", "ANGLE", "HRPO", "CRS"), and size ("1/4 X 2", "11GA").
- item_name: the plain material, e.g. "A36 steel flat bar 1/4 x 2 in", "6061 aluminum sheet 0.125 in".
- ${SEPARATE_CHARGES}`,
      menu: `This business is a metal fabrication shop: the "menu" is a quote or a price list of standard parts or jobs. Each part or job with its price is an item.`,
      recipe: `This business is a metal fabrication shop: the "recipe" is a job sheet, cut list or bill of materials for one job or a run of parts. Lines are materials (stock by length, sheet or weight; fasteners by count; consumables) and outside services. The yield is how many parts or units the job makes.`,
    },
  },
};

// Unknown, missing or misspelled → "other", which reads like food. Free-text
// values from before migration 026 are tolerated ("Food Truck").
export function normalizeIndustryId(value: string | null | undefined): IndustryId | null {
  if (value == null || !value.trim()) return null;
  const key = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return (INDUSTRY_IDS as readonly string[]).includes(key) ? (key as IndustryId) : "other";
}

// The profile for an org's business_type (null → today's food wording).
export function industryProfile(businessType: string | null | undefined): IndustryProfile {
  return INDUSTRIES[normalizeIndustryId(businessType) ?? "other"];
}

// organizations.industry_settings: per-org overrides. Anything malformed is ignored.
export type IndustrySettings = {
  units?: string[];
  categories?: string[];
  show_labor?: boolean;
  default_waste_pct?: number;
  default_overhead_pct?: number;
};

export type ResolvedIndustry = IndustryProfile & { hasMarketData: boolean; customSuggestions: boolean };

const strings = (v: unknown) => (Array.isArray(v) && v.every((s) => typeof s === "string" && s.trim()) && v.length ? (v as string[]) : undefined);
const pct = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 100 ? v : undefined);

export function resolveIndustry(businessType: string | null | undefined, settings?: unknown): ResolvedIndustry {
  const base = industryProfile(businessType);
  const s = settings && typeof settings === "object" ? (settings as Record<string, unknown>) : {};
  const units = strings(s.units);
  const categories = strings(s.categories);
  return {
    ...base,
    units: units ?? base.units,
    categories: categories ?? base.categories,
    customSuggestions: units != null || categories != null,
    defaults: {
      default_waste_pct: pct(s.default_waste_pct) ?? base.defaults.default_waste_pct,
      default_overhead_pct: pct(s.default_overhead_pct) ?? base.defaults.default_overhead_pct,
      show_labor_by_default: typeof s.show_labor === "boolean" ? s.show_labor : base.defaults.show_labor_by_default,
    },
    hasMarketData: base.market.series.some((x) => x.ingesting),
  };
}

// What the unit/category inputs suggest. Food screens each keep their own
// list exactly as before (undefined = "use your own"), so a food org sees no
// change unless it set its own lists in industry_settings; other industries
// get their profile's lists.
export function formSuggestions(p: Pick<ResolvedIndustry, "family" | "units" | "categories" | "customSuggestions">): { units: string[]; categories: string[] } | undefined {
  return p.family === "food" && !p.customSuggestions ? undefined : { units: p.units, categories: p.categories };
}
