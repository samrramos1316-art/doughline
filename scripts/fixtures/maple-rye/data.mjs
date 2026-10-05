// "Maple & Rye Bakery" — a whole small business, used by
// scripts/make-business-fixtures.mjs (renders the invoices) and
// scripts/test-business-e2e.mjs (runs the business through the live app).
//
// Dates are relative to the day the run happens (the owner's local date), so
// "this week's" invoices are always this week's. The owner signs up, loads the
// ingredient list they keep in a spreadsheet (today's prices), builds
// recipes and a menu, backfills two old invoices, then this week's
// deliveries arrive: a 2-page emailed PDF from the broadline distributor,
// a phone photo of the dairy invoice, a packaging invoice full of things the
// app has never seen, and a receipt photo too blurry to read.

export const BUSINESS = {
  name: "Maple & Rye Bakery",
  type: "bakery",
  owner: "Jordan Avery",
  address: ["1807 S 1st St", "Austin, TX 78704"],
  account: "MRB-2291",
};

// The owner's spreadsheet: name, category, base_unit, current_unit_cost.
export const INGREDIENTS = [
  ["All-Purpose Flour", "dry_goods", "lb", 0.46],
  ["Bread Flour", "dry_goods", "lb", 0.52],
  ["Granulated Sugar", "dry_goods", "lb", 0.72],
  ["Light Brown Sugar", "dry_goods", "lb", 0.89],
  ["Unsalted Butter", "dairy", "lb", 3.55],
  ["Large Eggs", "dairy", "each", 0.24],
  ["Whole Milk", "dairy", "gal", 4.4],
  ["Heavy Cream", "dairy", "qt", 4.6],
  ["Cream Cheese", "dairy", "lb", 3.05],
  ["Semi-Sweet Chocolate Chips", "dry_goods", "lb", 3.6],
  ["Pure Vanilla Extract", "dry_goods", "oz", 1.1],
  ["Instant Yeast", "dry_goods", "lb", 5.2],
  ["Kosher Salt", "dry_goods", "lb", 0.65],
  ["Ground Cinnamon", "dry_goods", "oz", 0.38],
];

// Quantities are in each ingredient's base unit (the recipe grid enforces it).
export const RECIPES = [
  {
    name: "Butter Croissants", yield: [24, "croissants"],
    lines: [["Bread Flour", 4.4], ["Unsalted Butter", 2.75], ["Whole Milk", 0.26], ["Granulated Sugar", 0.5], ["Instant Yeast", 0.09], ["Kosher Salt", 0.09], ["Large Eggs", 2]],
  },
  {
    name: "Chocolate Chip Cookies", yield: [36, "cookies"],
    lines: [["All-Purpose Flour", 2.5], ["Unsalted Butter", 2], ["Light Brown Sugar", 1.5], ["Granulated Sugar", 1], ["Large Eggs", 4], ["Semi-Sweet Chocolate Chips", 2.5], ["Pure Vanilla Extract", 1], ["Kosher Salt", 0.03]],
  },
  {
    name: "Cinnamon Rolls", yield: [12, "rolls"],
    lines: [["All-Purpose Flour", 2.2], ["Unsalted Butter", 1], ["Light Brown Sugar", 0.75], ["Whole Milk", 0.13], ["Large Eggs", 2], ["Instant Yeast", 0.03], ["Ground Cinnamon", 1.5], ["Cream Cheese", 0.5], ["Kosher Salt", 0.02]],
  },
  {
    name: "Vanilla Cheesecake", yield: [12, "slices"],
    lines: [["Cream Cheese", 2.5], ["Granulated Sugar", 0.45], ["Large Eggs", 4], ["Heavy Cream", 0.5], ["Pure Vanilla Extract", 0.5]],
  },
  {
    name: "Country Sourdough", yield: [8, "loaves"],
    lines: [["Bread Flour", 8], ["Kosher Salt", 0.16]],
  },
];

export const MENU = [
  ["Butter Croissant", "Butter Croissants", 4.25],
  ["Chocolate Chip Cookie", "Chocolate Chip Cookies", 3.0],
  ["Cinnamon Roll", "Cinnamon Rolls", 4.75],
  ["Cheesecake Slice", "Vanilla Cheesecake", 6.5],
  ["Sourdough Loaf", "Country Sourdough", 9.0],
];


// The owner's calendar: today in local time, and N days before it.
const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const TODAY = iso(new Date());
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return { date: iso(d), dateText: d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }), slash: `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}` };
}
const AGO = { backfill1: daysAgo(67), backfill2: daysAgo(39), today: daysAgo(0), yesterday: daysAgo(1) };

const LONE_STAR = { name: "Lone Star Foodservice", color: "#8a1c1c", lines: ["8100 Burleson Rd · Austin, TX 78744", "(512) 555-0142 · ar@lonestarfs.example"], terms: "Net 15" };
const HILL_COUNTRY = { name: "Hill Country Dairy Supply", color: "#2f5d3a", lines: ["2208 Ranch Rd 12 · San Marcos, TX 78666", "orders@hillcountrydairy.example"], terms: "Net 14" };
const BAKERS_BOX = { name: "Bakers Box Packaging Co.", color: "#1f4e79", lines: ["41 Industrial Blvd · Round Rock, TX 78664", "hello@bakersbox.example"], terms: "Due on receipt" };

// Each line: [item #, description, qty, invoice unit, unit price].
// `expect` is what the owner does with the line in review and the cost per
// base unit the app should arrive at:
//   ingredient: match to this existing ingredient
//   create: [name, base_unit, category] a brand-new ingredient
//   skip: not a recipe ingredient (gloves, sanitizer) — owner skips it
export const INVOICES = [
  {
    file: "01-lone-star-backfill.pdf", kind: "pdf", batch: "backfill",
    vendor: LONE_STAR, number: "LSF-118204", date: AGO.backfill1.date, dateText: AGO.backfill1.dateText,
    lines: [
      ["104421", "FLOUR BREAD HI-GLUTEN 50 LB", 3, "BG", 25.5, { ingredient: "Bread Flour", base: 0.51 }],
      ["104410", "FLOUR ALL PURPOSE BLEACHED 50 LB", 2, "BG", 22.5, { ingredient: "All-Purpose Flour", base: 0.45 }],
      ["201133", "SUGAR GRANULATED EXTRA FINE 50 LB", 2, "BG", 35.5, { ingredient: "Granulated Sugar", base: 0.71 }],
      ["300918", "BUTTER SOLID UNSALTED AA 36/1 LB", 2, "CS", 124.2, { ingredient: "Unsalted Butter", base: 3.45 }],
      ["410027", "EGGS SHELL LARGE GR A 15 DZ", 2, "CS", 41.4, { ingredient: "Large Eggs", base: 0.23 }],
      ["522810", "CHOC CHIP SEMI-SWEET 1M 30 LB", 1, "CS", 105.0, { ingredient: "Semi-Sweet Chocolate Chips", base: 3.5 }],
    ],
    fees: [["Fuel surcharge", 4.95]],
  },
  {
    file: "02-hill-country-backfill.pdf", kind: "pdf", batch: "backfill",
    vendor: HILL_COUNTRY, number: "HCD-41102", date: AGO.backfill2.date, dateText: AGO.backfill2.dateText,
    lines: [
      ["20391", "MILK WHOLE 4/1 GAL", 3, "CS", 17.2, { ingredient: "Whole Milk", base: 4.3 }],
      ["20455", "CREAM HEAVY 40% 12/1 QT", 1, "CS", 54.0, { ingredient: "Heavy Cream", base: 4.5 }],
      ["20988", "CREAM CHEESE BLOCK 30 LB", 1, "CS", 90.0, { ingredient: "Cream Cheese", base: 3.0 }],
    ],
    fees: [["Delivery", 12.0]],
  },
  {
    // This week's delivery, emailed as a 2-page PDF.
    file: "03-lone-star-this-week.pdf", kind: "pdf", batch: "this-week",
    vendor: LONE_STAR, number: "LSF-121877", date: AGO.today.date, dateText: AGO.today.dateText,
    pageBreakAfter: 6,
    lines: [
      ["104421", "FLOUR BREAD HI-GLUTEN 50 LB", 3, "BG", 26.75, { ingredient: "Bread Flour", base: 0.535 }],
      ["104410", "FLOUR ALL PURPOSE BLEACHED 50 LB", 2, "BG", 23.5, { ingredient: "All-Purpose Flour", base: 0.47 }],
      ["201133", "SUGAR GRANULATED EXTRA FINE 50 LB", 2, "BG", 37.0, { ingredient: "Granulated Sugar", base: 0.74 }],
      ["201140", "SUGAR BROWN LIGHT 25 LB", 1, "BG", 22.25, { ingredient: "Light Brown Sugar", base: 0.89 }],
      ["300918", "BUTTER SOLID UNSALTED AA 36/1 LB", 2, "CS", 150.84, { ingredient: "Unsalted Butter", base: 4.19 }],
      ["410027", "EGGS SHELL LARGE GR A 15 DZ", 2, "CS", 48.6, { ingredient: "Large Eggs", base: 0.27 }],
      ["522810", "CHOC CHIP SEMI-SWEET 1M 30 LB", 1, "CS", 111.0, { ingredient: "Semi-Sweet Chocolate Chips", base: 3.7 }],
      ["611502", "YEAST INSTANT SAF 20/1 LB", 1, "CS", 108.0, { ingredient: "Instant Yeast", base: 5.4 }],
      ["700214", "SALT KOSHER DIAMOND 9/3 LB", 1, "CS", 17.82, { ingredient: "Kosher Salt", base: 0.66 }],
      ["905531", "GLOVES NITRILE LARGE 10/100 CT", 1, "CS", 64.5, { skip: true }],
      ["907712", "SANITIZER QUAT 4/1 GAL", 1, "CS", 41.2, { skip: true }],
    ],
    fees: [["Fuel surcharge", 4.95]],
  },
  {
    // Snapped on the owner's phone at the back door.
    file: "04-hill-country-phone-photo.jpg", kind: "photo", batch: "phone",
    vendor: HILL_COUNTRY, number: "HCD-42260", date: AGO.today.date, dateText: AGO.today.dateText,
    lines: [
      ["20391", "MILK WHOLE 4/1 GAL", 2, "CS", 17.96, { ingredient: "Whole Milk", base: 4.49 }],
      ["20455", "CREAM HEAVY 40% 12/1 QT", 1, "CS", 60.48, { ingredient: "Heavy Cream", base: 5.04 }],
      ["20988", "CREAM CHEESE BLOCK 30 LB", 1, "CS", 96.45, { ingredient: "Cream Cheese", base: 3.215 }],
    ],
    fees: [["Delivery", 12.0]],
  },
  {
    file: "05-bakers-box-this-week.pdf", kind: "pdf", batch: "this-week",
    vendor: BAKERS_BOX, number: "BBP-7731", date: AGO.yesterday.date, dateText: AGO.yesterday.dateText,
    lines: [
      ["PB-884W", "BOX PASTRY WHITE 8X8X4 W/WINDOW 250/CS", 1, "CS", 71.25, { create: ["Pastry Box 8x8", "each", "packaging"], base: 0.285 }],
      ["GB-4765", "BAG COOKIE GLASSINE 4.75X6.5 1000/CS", 1, "CS", 38.0, { create: ["Glassine Cookie Bag", "each", "packaging"], base: 0.038 }],
      ["LR-2K", "LABEL ROUND KRAFT 2IN 500/RL", 2, "RL", 14.5, { create: ["Kraft Sticker Label", "each", "packaging"], base: 0.029 }],
    ],
    fees: [["Shipping", 9.5]],
  },
  {
    // A top-up delivery from the distributor later the same day: every line
    // is one the owner already decided about, so it should need no review.
    file: "07-lone-star-top-up.pdf", kind: "pdf", batch: "repeat",
    vendor: LONE_STAR, number: "LSF-122310", date: AGO.today.date, dateText: AGO.today.dateText,
    lines: [
      ["300918", "BUTTER SOLID UNSALTED AA 36/1 LB", 1, "CS", 150.84, { ingredient: "Unsalted Butter", base: 4.19 }],
      ["905531", "GLOVES NITRILE LARGE 10/100 CT", 1, "CS", 64.5, { skip: true }],
      ["907712", "SANITIZER QUAT 4/1 GAL", 1, "CS", 41.2, { skip: true }],
    ],
    fees: [["Fuel surcharge", 4.95]],
  },
  {
    // A thermal receipt photographed in bad light: unreadable on purpose.
    // The owner types it in by hand (manual entry).
    file: "06-restaurant-depot-receipt-blurry.jpg", kind: "blurry", batch: "this-week",
    vendor: { name: "Capital Cash & Carry", color: "#222", lines: ["900 Warehouse Row · Austin, TX", "Member 0071-2291"], terms: "Paid — card" },
    number: "RD-5502-8813", date: AGO.today.date, dateText: AGO.today.slash,
    lines: [
      ["", "CINNAMON GROUND 18 OZ", 1, "EA", 6.84, { ingredient: "Ground Cinnamon", base: 0.38, pack: [18, "oz"] }],
      ["", "VANILLA EXTRACT PURE 32 OZ", 1, "EA", 36.8, { ingredient: "Pure Vanilla Extract", base: 1.15, pack: [32, "oz"] }],
    ],
    fees: [],
  },
];

export const money = (n) => n.toFixed(2);
export const lineTotal = ([, , qty, , price]) => Math.round(qty * price * 100) / 100;

// ---- §9.3 onboarding import: the owner's menu and two recipes -------------
export const MENU_BOARD = {
  file: "10-menu.pdf",
  sections: [
    ["Pastries", [["Butter Croissant", "4.25", "Laminated for three days"], ["Pain au Chocolat", "4.75", "Two batons of dark chocolate"], ["Cinnamon Roll", "4.75", "Cream cheese glaze"]]],
    ["Cookies & Cake", [["Chocolate Chip Cookie", "3.00", "Brown butter, flaky salt"], ["Cheesecake Slice", "6.50", "New York style"]]],
    ["Bread", [["Country Sourdough Loaf", "9.00", "Naturally leavened, 36-hour ferment"]]],
    ["Coffee", [["Drip Coffee", "3.00 / 3.75", "12 oz / 16 oz"]]],
  ],
  addOn: "Add oat milk +0.75",
  // What the review table should end up with.
  expect: [["Butter Croissant", 4.25], ["Pain au Chocolat", 4.75], ["Cinnamon Roll", 4.75], ["Chocolate Chip Cookie", 3.0], ["Cheesecake Slice", 6.5], ["Country Sourdough Loaf", 9.0], ["Drip Coffee", 3.0]],
};

// A handwritten card, photographed: metric weights and a litre of milk, so
// every line converts to the ingredient's base unit on its own.
export const RECIPE_CARD = {
  file: "11-croissant-recipe-card.jpg",
  title: "Butter Croissants",
  yieldText: "Makes 24",
  lines: ["2 kg bread flour", "1.25 kg unsalted butter (cold, for the block)", "1 L whole milk", "225 g sugar", "40 g instant yeast", "40 g kosher salt", "2 eggs (wash)"],
  method: "Mix, rest overnight. Laminate: 3 letter folds, 30 min rests. Shape, proof 2 h, egg wash, bake 200°C 18 min.",
  // ingredient → quantity in its base unit
  expect: { "Bread Flour": 4.4092, "Unsalted Butter": 2.7558, "Whole Milk": 0.2642, "Granulated Sugar": 0.496, "Instant Yeast": 0.0882, "Kosher Salt": 0.0882, "Large Eggs": 2 },
};

// A typed recipe in cups and spoons: volumes can't become pounds without a
// density, so the owner types those in (what `fill` holds), and "flaky sea
// salt" isn't in the price list, so it's created as a new ingredient.
export const RECIPE_DOC = {
  file: "12-cookie-recipe.pdf",
  title: "Brown Butter Chocolate Chip Cookies",
  yieldText: "Makes 18 large cookies",
  lines: ["2 1/4 cups all-purpose flour", "1 cup (227 g) unsalted butter, browned", "3/4 cup light brown sugar, packed", "1/2 cup granulated sugar", "2 large eggs", "2 cups (340 g) semi-sweet chocolate chips", "2 tsp pure vanilla extract", "1 tsp kosher salt", "Flaky sea salt, for finishing"],
  fill: { flour: 0.62, "brown sugar": 0.36, "granulated sugar": 0.22, vanilla: 0.33, "kosher salt": 0.013, flaky: 0.01 },
  newIngredient: { match: /flaky/i, name: "Flaky Sea Salt", unit: "lb", category: "dry_goods" },
};
