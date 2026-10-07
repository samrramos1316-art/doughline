import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { VisionProvider, VisionExtractionResult, MenuExtractionResult, RecipeExtractionResult, ExtractOptions } from "./types";
import { visionPrompt } from "./prompts";

// What an upload actually is, decided by every reader whichever box the
// owner dropped it in — so a menu sent to the invoice scanner, or an invoice
// dropped on the recipe import, is caught and routed instead of misread.
const DOCUMENT_TYPE = z
  .enum(["invoice", "menu", "recipe", "other"])
  .describe("What this page actually is, whatever it was uploaded as");

// §5.3's extraction contract, as Zod. Structured outputs constrain sampling to
// this schema, so the response is guaranteed to parse — no retry loop.
const ExtractionSchema = z.object({
  document_type: DOCUMENT_TYPE,
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

const MODEL = "claude-opus-5-5";

// §9.3: a menu → items and prices.
const MenuSchema = z.object({
  document_type: DOCUMENT_TYPE,
  items: z.array(
    z.object({
      name_guess: z.string().describe("The menu item's name as printed, without its price or description"),
      price_guess: z.number().nullable().describe("Its price in dollars; the single-item price if several sizes are listed"),
    }),
  ),
});

// §9.3: one recipe → name, yield, ingredient lines.
const RecipeSchema = z.object({
  document_type: DOCUMENT_TYPE,
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

  extractInvoice(fileBuffer: Buffer, mimeType: string, opts?: ExtractOptions): Promise<VisionExtractionResult> {
    return this.extract(ExtractionSchema, visionPrompt("invoice", opts?.hints), fileBuffer, mimeType, "invoice");
  }

  extractMenu(fileBuffer: Buffer, mimeType: string, opts?: ExtractOptions): Promise<MenuExtractionResult> {
    return this.extract(MenuSchema, visionPrompt("menu", opts?.hints), fileBuffer, mimeType, "menu");
  }

  extractRecipe(fileBuffer: Buffer, mimeType: string, opts?: ExtractOptions): Promise<RecipeExtractionResult> {
    return this.extract(RecipeSchema, visionPrompt("recipe", opts?.hints), fileBuffer, mimeType, "recipe");
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
