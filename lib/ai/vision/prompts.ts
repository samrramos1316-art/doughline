import { withIndustryHints } from "@/lib/industries/extraction";
import type { ExtractionKind } from "@/lib/industries";

// The vision prompts, shared by every provider (§5.1) so switching
// VISION_PROVIDER never changes what the model is asked. Written for a food
// business; an industry profile's hints (lib/industries) are appended by
// visionPrompt() — food profiles have none, so their prompts are these,
// unchanged.

const DOCUMENT_TYPES = `- "invoice": a record of goods the business BOUGHT from a supplier — invoice, packing slip, delivery ticket, or store receipt. It names a seller and lists purchased items with quantities and prices. A receipt or invoice that is blurry, torn, or only partly legible is still "invoice".
- "menu": items the business SELLS to its own customers, with customer prices (a menu board, price list, or catering menu). No supplier, no quantities bought.
- "recipe": ingredients and amounts for making something, usually with a yield or method.
- "other": clearly none of these (a letter, a flyer, a photo of food, a price quote with nothing bought).`;

const classifyFirst = (expected: "invoice" | "menu" | "recipe", empty: string) => `First decide document_type — what the page really is, even though it was uploaded as a ${expected}:
${DOCUMENT_TYPES}
When unsure, say "${expected}". Only choose another type when the page is clearly that type.
If document_type is not "${expected}", ${empty} — do not force it into ${expected} shape.`;

const INVOICE_PROMPT = `You extract line items from supplier invoices, packing slips, and receipts for a small food business. The input is usually a phone photo: it may be skewed, crumpled, or partly shadowed.

${classifyFirst("invoice", "return every other field null and line_items empty")}
For a blurry or partly legible invoice, return whatever lines you can read, even none.

For an invoice:
- vendor_name_guess: the SELLER (the supplier whose name heads the invoice), never the "bill to" / "ship to" customer.

- raw_text: copy each item description exactly as printed, abbreviations and codes included (e.g. "ORG CHKN BRST 40# CS"). Do not expand or correct it — it is matched against the vendor's past wording later.
- item_name: the plain-English, generic name of the product as a cook would write it on an ingredient list — abbreviations expanded, no brand, pack size, case count, or item code (e.g. "ORG CHKN BRST 40# CS" -> "organic chicken breast"). null if you can't tell what the product is.
- quantity / unit / unit_cost / line_total: the numbers printed on that line. Use null for anything not printed or not legible; never compute or guess a missing value.
- pack_quantity / pack_unit: the size of ONE invoice unit (one case, bag, each…) as printed in the description, as a single total. Multiply a printed count × size: "50#" -> 50 lb; "36/1#" -> 36 lb; "15DZ" -> 15 dozen; "4/1 GAL" -> 4 gal; "12/QT" -> 12 qt; "32OZ" -> 32 oz; "6/#10" -> null (can size, not a measure). Ignore numbers that aren't a pack size (chip counts like "1M", fat % like "40%"). Use "lb" for "#". null for both if no pack size is printed.
- Skip subtotal, tax, delivery-fee, deposit, and total rows — only purchased items.
- invoice_date_guess: ISO 8601 (YYYY-MM-DD), or null if absent.
- invoice_total_guess: the grand total due as printed (after fees and tax), or null if not printed or not legible.`;

const MENU_PROMPT = `You read menus for a small food business — a chalkboard photo, a printed card, a Canva PDF, a screenshot. List every item a customer can buy, in the order printed.

${classifyFirst("menu", "return items empty")}

- name_guess: the item's name as printed (fix obvious photo-reading errors, keep the business's own wording). No price, no description, no allergen codes.
- price_guess: the price as a number of dollars ("$4.25" -> 4.25, "4.5" -> 4.5). If an item lists several sizes or counts, use the smallest/single one. null if no price is printed for it.
- Skip section headings, descriptions, opening hours, and add-ons that aren't sold on their own ("add oat milk +0.50").`;

const RECIPE_PROMPT = `You read recipes for a small food business — a handwritten card, a notebook page, a printed or typed document. Extract ONE recipe (the main one if the page has several).

${classifyFirst("recipe", "return every other field null and ingredient_lines empty")}

- name_guess: the recipe's title.
- yield_qty_guess / yield_unit_guess: what one batch makes ("Makes 2 dozen cookies" -> 24, "cookies"; "Serves 8" -> 8, "servings"; "One 9-inch cake, 12 slices" -> 12, "slices"). null if not stated.
- ingredient_lines: one entry per ingredient, in order. raw_text copied as written. quantity_guess as a number — convert fractions and mixed numbers ("1 1/2" -> 1.5, "½" -> 0.5); for a range use the first number. unit_guess as written but spelled simply (cup, tbsp, tsp, g, kg, oz, lb, ml, l, each, stick, pinch); null for a bare count ("3 eggs" -> 3, null). If a line gives two measures ("1 cup (227 g) butter"), prefer the weight: 227, "g".
- item_name_guess: the plain ingredient a cook would buy, no quantity or preparation ("2 cups flour, sifted" -> "all-purpose flour"; "3 large eggs, room temp" -> "large eggs").
- Skip method steps, notes, and equipment.`;

const BASE: Record<ExtractionKind, string> = { invoice: INVOICE_PROMPT, menu: MENU_PROMPT, recipe: RECIPE_PROMPT };

export function visionPrompt(kind: ExtractionKind, hints?: string | null): string {
  return withIndustryHints(BASE[kind], hints);
}
