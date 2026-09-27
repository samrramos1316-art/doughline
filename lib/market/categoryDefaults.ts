// §3.10 / §7: which commodity series an ingredient follows.
//   1. ingredients.commodity_code, if the owner set one
//   2. a name match against the series we track (butter → CME butter,
//      eggs → the egg index, flour → wheat…). The spec only defaults by
//      category, but a bakery files eggs and butter under "dairy", and the
//      dairy index would bury the two series that matter most to it.
//   3. a category default — narrower than §3.10's: "dry_goods → wheat"
//      would tie salt, baking soda and chocolate chips to wheat (flour is
//      caught by name above), so dry goods get no default; "protein" maps
//      to the meat index rather than eggs, which the name rule covers.
//   4. nothing — the ingredient isn't shown against any series.

const NAME_RULES: [RegExp, string][] = [
  [/\beggs?\b/i, "eggs_large_white"],
  [/\bbutter\b(?!milk)/i, "butter"],
  [/\b(flour|wheat)\b/i, "wheat"],
  [/\bsugar\b/i, "fao_sugar_index"],
  [/\b(oil|shortening)\b/i, "fao_oils_index"],
  [/\b(milk|cream|cheese|buttermilk|yogurt)\b/i, "fao_dairy_index"],
  [/\b(beef|pork|chicken|turkey|lamb|bacon|sausage|ham)\b/i, "fao_meat_index"],
  [/\b(rice|oats?|corn|barley|cornmeal)\b/i, "fao_cereals_index"],
];

export const CATEGORY_DEFAULTS: Record<string, string> = {
  dairy: "fao_dairy_index",
  protein: "fao_meat_index",
};

export function commodityFor(ingredient: { name: string; category: string | null; commodity_code: string | null }) {
  if (ingredient.commodity_code) return ingredient.commodity_code;
  for (const [re, code] of NAME_RULES) if (re.test(ingredient.name)) return code;
  return ingredient.category ? (CATEGORY_DEFAULTS[ingredient.category] ?? null) : null;
}
