import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { VisionProvider, VisionExtractionResult, MenuExtractionResult, RecipeExtractionResult } from "./types";

// §5.3's extraction contract, as Zod. Structured outputs constrain sampling to
// this schema, so the response is guaranteed to parse — no retry loop.
const ExtractionSchema = z.object({
  document_type: z
    .enum(["invoice", "menu", "recipe", "other"])
    .describe("What this page is; only an invoice has line items"),
  vendor_name_guess: z.string().nullable(),
  invoice_date_guess: z.string().nullable().describe("ISO 8601 date (YYYY-MM-DD)"),
  invoice_number_guess: z.string().nullable(),
  invoice_total_guess: z.number().nullable().describe("The grand total due, as printed"),
  line_items: z.array(
    z.object({
      raw_text: z.string().describe("The item description exactly as printed"),
      item_name: z
        .string()
        .nullable()
        .describe("Plain-English generic product name, abbreviations expanded, no brand/pack size/code"),
      quantity: z.number().nullable(),
      unit: z.string().nullable(),
      unit_cost: z.number().nullable(),
      line_total: z.number().nullable(),
      pack_quantity: z
        .number()
        .nullable()
        .describe("Total amount in ONE invoice unit, from the pack size printed in the description"),
      pack_unit: z.string().nullable().describe("Unit of pack_quantity, e.g. lb, oz, dozen, each, gal, qt"),
    }),
  ),
});

const SYSTEM_PROMPT = `You extract line items from supplier invoices, packing slips, and receipts for a small food business. The input is usually a phone photo: it may be skewed, crumpled, or partly shadowed.

First decide document_type:
- "invoice": a record of goods the business BOUGHT from a supplier — invoice, packing slip, delivery ticket, or store receipt. It names a seller and lists purchased items with quantities and prices. A receipt or invoice that is blurry, torn, or only partly legible is still "invoice" — return whatever lines you can read, even none.
- "menu": items the business SELLS to its own customers, with customer prices (a menu board, price list, or catering menu). No supplier, no quantities bought.
- "recipe": ingredients and amounts for making something, usually with a yield or method.
- "other": clearly something else (a letter, a flyer, a photo of food, a price quote with nothing bought). When unsure, say "invoice".
If document_type is not "invoice", return every other field null and line_items empty — do not force a menu or recipe into invoice shape.

For an invoice:
- vendor_name_guess: the SELLER (the supplier whose name heads the invoice), never the "bill to" / "ship to" customer.

- raw_text: copy each item description exactly as printed, abbreviations and codes included (e.g. "ORG CHKN BRST 40# CS"). Do not expand or correct it — it is matched against the vendor's past wording later.
- item_name: the plain-English, generic name of the product as a cook would write it on an ingredient list — abbreviations expanded, no brand, pack size, case count, or item code (e.g. "ORG CHKN BRST 40# CS" -> "organic chicken breast"). null if you can't tell what the product is.
- quantity / unit / unit_cost / line_total: the numbers printed on that line. Use null for anything not printed or not legible; never compute or guess a missing value.
- pack_quantity / pack_unit: the size of ONE invoice unit (one case, bag, each…) as printed in the description, as a single total. Multiply a printed count × size: "50#" -> 50 lb; "36/1#" -> 36 lb; "15DZ" -> 15 dozen; "4/1 GAL" -> 4 gal; "12/QT" -> 12 qt; "32OZ" -> 32 oz; "6/#10" -> null (can size, not a measure). Ignore numbers that aren't a pack size (chip counts like "1M", fat % like "40%"). Use "lb" for "#". null for both if no pack size is printed.
- Skip subtotal, tax, delivery-fee, deposit, and total rows — only purchased items.
- invoice_date_guess: ISO 8601 (YYYY-MM-DD), or null if absent.
- invoice_total_guess: the grand total due as printed (after fees and tax), or null if not printed or not legible.`;

const MODEL = "claude-opus-5-5";

// §9.3: a menu → items and prices.
const MenuSchema = z.object({
  items: z.array(
    z.object({
      name_guess: z.string().describe("The menu item's name as printed, without its price or description"),
      price_guess: z.number().nullable().describe("Its price in dollars; the single-item price if several sizes are listed"),
    }),
  ),
});

const MENU_PROMPT = `You read menus for a small food business — a chalkboard photo, a printed card, a Canva PDF, a screenshot. List every item a customer can buy, in the order printed.

- name_guess: the item's name as printed (fix obvious photo-reading errors, keep the business's own wording). No price, no description, no allergen codes.
- price_guess: the price as a number of dollars ("$4.25" -> 4.25, "4.5" -> 4.5). If an item lists several sizes or counts, use the smallest/single one. null if no price is printed for it.
- Skip section headings, descriptions, opening hours, and add-ons that aren't sold on their own ("add oat milk +0.50").`;

// §9.3: one recipe → name, yield, ingredient lines.
const RecipeSchema = z.object({
  name_guess: z.string().nullable(),
  yield_qty_guess: z.number().nullable().describe("How many servings/pieces one batch makes"),
  yield_unit_guess: z.string().nullable().describe("What the yield counts, e.g. cookies, slices, loaves"),
  ingredient_lines: z.array(
    z.object({
      raw_text: z.string().describe("The ingredient line exactly as written"),
      quantity_guess: z.number().nullable(),
      unit_guess: z.string().nullable(),
      item_name_guess: z.string().nullable().describe("Plain-English ingredient name, no quantity or preparation"),
    }),
  ),
});

const RECIPE_PROMPT = `You read recipes for a small food business — a handwritten card, a notebook page, a printed or typed document. Extract ONE recipe (the main one if the page has several).

- name_guess: the recipe's title.
- yield_qty_guess / yield_unit_guess: what one batch makes ("Makes 2 dozen cookies" -> 24, "cookies"; "Serves 8" -> 8, "servings"; "One 9-inch cake, 12 slices" -> 12, "slices"). null if not stated.
- ingredient_lines: one entry per ingredient, in order. raw_text copied as written. quantity_guess as a number — convert fractions and mixed numbers ("1 1/2" -> 1.5, "½" -> 0.5); for a range use the first number. unit_guess as written but spelled simply (cup, tbsp, tsp, g, kg, oz, lb, ml, l, each, stick, pinch); null for a bare count ("3 eggs" -> 3, null). If a line gives two measures ("1 cup (227 g) butter"), prefer the weight: 227, "g".
- item_name_guess: the plain ingredient a cook would buy, no quantity or preparation ("2 cups flour, sifted" -> "all-purpose flour"; "3 large eggs, room temp" -> "large eggs").
- Skip method steps, notes, and equipment.`;

type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";
const IMAGE_TYPES: readonly string[] = ["image/jpeg", "image/png", "image/gif", "image/webp"];

// §5.1: Claude's structured-outputs API as a vision provider (selected with
// VISION_PROVIDER=claude). One call shape for all three targets (§9.3):
// the file as an image or PDF document, a system prompt, a Zod schema.
export class ClaudeVisionProvider implements VisionProvider {
  private client: Anthropic;

  constructor() {
    // The project keeps the key as CLAUDE_API_KEY; fall back to the SDK's
    // standard credential resolution (ANTHROPIC_API_KEY etc.) if it's unset.
    const apiKey = process.env.CLAUDE_API_KEY;
    this.client = apiKey ? new Anthropic({ apiKey }) : new Anthropic();
  }

  extractInvoice(fileBuffer: Buffer, mimeType: string): Promise<VisionExtractionResult> {
    return this.extract(ExtractionSchema, SYSTEM_PROMPT, fileBuffer, mimeType, "invoice");
  }

  extractMenu(fileBuffer: Buffer, mimeType: string): Promise<MenuExtractionResult> {
    return this.extract(MenuSchema, MENU_PROMPT, fileBuffer, mimeType, "menu");
  }

  extractRecipe(fileBuffer: Buffer, mimeType: string): Promise<RecipeExtractionResult> {
    return this.extract(RecipeSchema, RECIPE_PROMPT, fileBuffer, mimeType, "recipe");
  }

  private async extract<T extends z.ZodType>(schema: T, system: string, fileBuffer: Buffer, mimeType: string, what: string): Promise<z.infer<T>> {
    const data = fileBuffer.toString("base64");

    let fileBlock: Anthropic.ContentBlockParam;
    if (mimeType === "application/pdf") {
      fileBlock = { type: "document", source: { type: "base64", media_type: "application/pdf", data } };
    } else if (IMAGE_TYPES.includes(mimeType)) {
      fileBlock = { type: "image", source: { type: "base64", media_type: mimeType as ImageMediaType, data } };
    } else {
      throw new Error(`Unsupported ${what} file type for Claude vision: ${mimeType}`);
    }

    const response = await this.client.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      system,
      messages: [{ role: "user", content: [fileBlock, { type: "text", text: `Extract this ${what}.` }] }],
      // Opus 5.5 defaults to medium; high is what Opus 5 ran at.
      output_config: { effort: "high", format: zodOutputFormat(schema) },
    });

    // Opt-in debugging: print Claude's response text verbatim, before the
    // SDK's parse, so it can be compared with what the pipeline stores.
    if (process.env.VISION_DEBUG_RAW === "1") {
      for (const block of response.content) {
        if (block.type === "text") console.log(`[vision-raw] ${response.id} ${block.text}`);
      }
    }

    if (response.stop_reason === "refusal") {
      throw new Error(`Claude declined to extract this ${what} (${response.stop_details?.category ?? "no category"})`);
    }
    if (response.stop_reason === "max_tokens") {
      throw new Error(`Claude's extraction was cut off at max_tokens — this ${what} is too long for one call`);
    }
    if (!response.parsed_output) {
      throw new Error("Claude returned no parseable extraction");
    }
    return response.parsed_output;
  }
}
