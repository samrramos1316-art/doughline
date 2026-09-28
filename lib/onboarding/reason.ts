import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

// §9.3's second pass: the decisions a cook makes without thinking, which
// word overlap and embeddings can't — which flour a croissant uses, what a
// cup of sugar weighs, which recipe a "Cheesecake Slice" is cut from and how
// many slices that is. Text only (the pages were already read); one call per
// recipe, one for the whole menu. Callers fall back to the plain matcher if
// a call fails, so the import never depends on this working.
const MODEL = "claude-opus-5";

function client() {
  const apiKey = process.env.CLAUDE_API_KEY;
  return apiKey ? new Anthropic({ apiKey }) : new Anthropic();
}

async function ask<T extends z.ZodType>(schema: T, system: string, input: unknown): Promise<z.infer<T>> {
  const response = await client().messages.parse({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system,
    messages: [{ role: "user", content: JSON.stringify(input) }],
    output_config: { format: zodOutputFormat(schema) },
  });
  if (response.stop_reason === "refusal") throw new Error("Claude declined");
  if (response.stop_reason === "max_tokens") throw new Error("Claude's answer was cut off");
  if (!response.parsed_output) throw new Error("Claude returned nothing parseable");
  return response.parsed_output;
}

// ---- recipe lines → the price list ----------------------------------------

export type PriceListItem = {
  id: string;
  name: string;
  base_unit: string;
  // What one base unit holds, when it's a container ("1 bag = 50 lb"), from
  // the latest invoice that had a pack size.
  pack: string | null;
};

export type RecipeLineIn = {
  index: number;
  raw_text: string;
  quantity: number | null;
  unit: string | null;
  item_name: string | null;
  suggestions: string[]; // price-list names the text matcher thought close
};

const LineDecision = z.object({
  index: z.number().int(),
  ingredient_id: z.string().nullable().describe("id from the price list, or null if nothing on it is this ingredient"),
  new_ingredient_name: z.string().nullable().describe("When ingredient_id is null: the plain name to add it under"),
  new_ingredient_unit: z.string().nullable().describe("When ingredient_id is null: lb, oz, each, gal… — what it would be bought and costed in"),
  quantity_in_unit: z.number().nullable().describe("The line's amount in the chosen ingredient's unit (base_unit, or new_ingredient_unit)"),
  confidence: z.enum(["high", "medium", "low"]),
  note: z.string().describe("One short line for the owner: why this ingredient, and any conversion used"),
});
const RecipeDecisions = z.object({ lines: z.array(LineDecision) });
export type LineDecision = z.infer<typeof LineDecision>;

const RECIPE_SYSTEM = `You are an experienced pastry chef and kitchen manager helping a small food business cost its recipes. You get one recipe (name, yield, ingredient lines as written) and the business's price list (each ingredient with the unit it is priced in, and for containers what one holds). For every line, decide which price-list ingredient it is and how much of that ingredient's unit the line uses.

Choosing the ingredient — decide as a cook would for THIS recipe:
- A generic word means the ingredient that recipe normally uses. "Flour" in bread, bagels, pizza, croissants or laminated dough → bread flour if the list has it; in cakes, cookies, muffins, scones, pie crust → all-purpose (or cake/pastry flour if listed and the recipe is a cake). "Butter" in baking → unsalted if listed. "Sugar" → granulated. "Brown sugar" → light brown unless "dark". "Cream" → heavy cream. "Milk" → whole milk. "Eggs" → the eggs on the list.
- Different products are not interchangeable: salted ≠ unsalted butter only matters if both are listed (then follow the recipe); bread flour ≠ cake flour when the recipe names one; buttermilk ≠ milk; cream cheese ≠ heavy cream; yeast types (instant, active dry, fresh) are the same ingredient for costing when only one is listed.
- The matcher's suggestions are hints from text similarity only — overrule them whenever the recipe says otherwise.
- If nothing on the list is this ingredient, set ingredient_id null and give new_ingredient_name (plain, generic, Title Case, no quantity or prep) and new_ingredient_unit (lb for things bought by weight, each for countables like eggs or lemons, the liquid unit — gal/qt — for milk and cream, oz for extracts and spices).
- Water and ice are free: ingredient_id null, new_ingredient_name null, quantity null, note "water — no cost".

Converting the amount into the chosen unit (quantity_in_unit):
- Weight/volume to the same kind of unit is exact (1 lb = 453.6 g, 1 qt = 4 cups).
- Volume to weight uses standard kitchen densities: 1 cup all-purpose flour 125 g, bread flour 130 g, cake flour 115 g, whole-wheat flour 120 g; granulated sugar 200 g, brown sugar (packed) 213 g, powdered sugar 120 g; butter 227 g per cup, 113 g per stick, 14 g per tbsp; cocoa 85 g; rolled oats 90 g; chocolate chips 170 g; honey 340 g; kosher salt 3 g per tsp (Diamond) or 5 g (Morton), table salt 6 g per tsp; instant/active dry yeast 3 g per tsp, 7 g per packet; baking soda/powder 4.5 g per tsp; vanilla extract 4.2 g per tsp.
- Countables: 1 large egg ≈ 50 g out of shell, 1 lemon ≈ 3 tbsp juice or 1 tbsp zest, 1 banana ≈ 120 g peeled.
- Containers: if the ingredient is priced per bag/case/flat/block and its pack is given ("1 bag = 50 lb"), return the fraction of one container (250 g of flour from a 50 lb bag = 0.011 bag). A "15 dozen case" of eggs holds 180 eggs; 3 eggs = 0.0167 case.
- Round to 4 significant decimals. Only return null when the amount is truly unknowable ("salt to taste", no quantity given).
- Put the conversion in the note ("1 cup ≈ 130 g bread flour → 0.2866 lb").

confidence: high when the ingredient is unambiguous and the conversion exact or standard; medium when you inferred the ingredient from context or used a density; low when you guessed. Return exactly one decision per input line, same index.`;

export async function resolveRecipeLines(input: {
  recipe_name: string | null;
  yield: string | null;
  lines: RecipeLineIn[];
  price_list: PriceListItem[];
}): Promise<LineDecision[]> {
  const out = await ask(RecipeDecisions, RECIPE_SYSTEM, input);
  return out.lines;
}

// ---- menu items → recipes --------------------------------------------------

export type MenuItemIn = { key: string; name: string; price: number | null };
export type RecipeIn = { key: string; name: string; yield_qty: number | null; yield_unit: string | null; ingredients: string[] };

const MenuLink = z.object({
  key: z.string(),
  recipe_key: z.string().nullable().describe("The recipe this item is made from, or null"),
  servings_per_batch: z
    .number()
    .nullable()
    .describe("How many of this menu item one batch of the recipe makes — only when that differs from the recipe's own yield count"),
  note: z.string().describe("One short line for the owner"),
});
const MenuLinks = z.object({ items: z.array(MenuLink) });
export type MenuLink = z.infer<typeof MenuLink>;

const MENU_SYSTEM = `You link a small food business's menu items to the recipes they are made from, so each item's food cost can be worked out. You get the menu (name, price) and the recipes (name, what one batch yields, ingredient names).

- Link by what the item actually is, not by shared words. "Classic Sourdough Loaf" ← "Country Sourdough"; "Almond Croissant" ← "Croissant Dough" when there is no almond-croissant recipe; "Blueberry Muffin" ← a muffin recipe with blueberries in it; "Chocolate Chip Cookie" ← "CCC (brown butter)". Several items may share one recipe (a plain and an almond croissant from the same dough).
- Don't force a link: an item with no plausible recipe (coffee, a bought-in drink, an item whose recipe wasn't uploaded) gets recipe_key null. A lemon tart is not made from a lemon-bar recipe; a cinnamon roll is not made from a croissant dough unless the recipe says so.
- servings_per_batch: set it only when the menu item is a different portion from what the recipe's yield counts. Recipe "makes 1 cheesecake (12 slices)" → "Cheesecake Slice" 12; recipe "makes 1 9-inch cake" → "Cake Slice" 12 unless the recipe says otherwise, and a "Whole Cake" 1; recipe "makes 24 cookies" → "Cookie" null (the yield already counts cookies), "Half-Dozen Box" 4; recipe "makes 2 loaves" → "Sourdough Loaf" null. Recipe yield in pieces and menu item is one piece → null.
- note: why this recipe (and the portion, if set), in a few words.
Return one entry per menu item, with its key.`;

export async function linkMenuToRecipes(input: { menu: MenuItemIn[]; recipes: RecipeIn[] }): Promise<MenuLink[]> {
  const out = await ask(MenuLinks, MENU_SYSTEM, input);
  return out.items;
}
