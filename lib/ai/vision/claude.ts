import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { VisionProvider, VisionExtractionResult } from "./types";

// §5.3's extraction contract, as Zod. Structured outputs constrain sampling to
// this schema, so the response is guaranteed to parse — no retry loop.
const ExtractionSchema = z.object({
  vendor_name_guess: z.string().nullable(),
  invoice_date_guess: z.string().nullable().describe("ISO 8601 date (YYYY-MM-DD)"),
  invoice_number_guess: z.string().nullable(),
  line_items: z.array(
    z.object({
      raw_text: z.string().describe("The item description exactly as printed"),
      quantity: z.number().nullable(),
      unit: z.string().nullable(),
      unit_cost: z.number().nullable(),
      line_total: z.number().nullable(),
    }),
  ),
});

const SYSTEM_PROMPT = `You extract line items from supplier invoices, packing slips, and receipts for a small food business. The input is usually a phone photo: it may be skewed, crumpled, or partly shadowed.

- raw_text: copy each item description exactly as printed, abbreviations and codes included (e.g. "ORG CHKN BRST 40# CS"). Do not expand or correct it — it is matched against the vendor's past wording later.
- quantity / unit / unit_cost / line_total: the numbers printed on that line. Use null for anything not printed or not legible; never compute or guess a missing value.
- Skip subtotal, tax, delivery-fee, deposit, and total rows — only purchased items.
- invoice_date_guess: ISO 8601 (YYYY-MM-DD), or null if absent.`;

const MODEL = "claude-opus-5";

type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";
const IMAGE_TYPES: readonly string[] = ["image/jpeg", "image/png", "image/gif", "image/webp"];

// §5.1: Claude's structured-outputs API as a vision provider (selected with
// VISION_PROVIDER=claude).
export class ClaudeVisionProvider implements VisionProvider {
  private client: Anthropic;

  constructor() {
    // The project keeps the key as CLAUDE_API_KEY; fall back to the SDK's
    // standard credential resolution (ANTHROPIC_API_KEY etc.) if it's unset.
    const apiKey = process.env.CLAUDE_API_KEY;
    this.client = apiKey ? new Anthropic({ apiKey }) : new Anthropic();
  }

  async extractInvoice(fileBuffer: Buffer, mimeType: string): Promise<VisionExtractionResult> {
    const data = fileBuffer.toString("base64");

    let fileBlock: Anthropic.ContentBlockParam;
    if (mimeType === "application/pdf") {
      fileBlock = { type: "document", source: { type: "base64", media_type: "application/pdf", data } };
    } else if (IMAGE_TYPES.includes(mimeType)) {
      fileBlock = { type: "image", source: { type: "base64", media_type: mimeType as ImageMediaType, data } };
    } else {
      throw new Error(`Unsupported invoice file type for Claude vision: ${mimeType}`);
    }

    const response = await this.client.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [fileBlock, { type: "text", text: "Extract this invoice." }],
        },
      ],
      output_config: { format: zodOutputFormat(ExtractionSchema) },
    });

    if (response.stop_reason === "refusal") {
      throw new Error(`Claude declined to extract this invoice (${response.stop_details?.category ?? "no category"})`);
    }
    if (response.stop_reason === "max_tokens") {
      throw new Error("Claude's extraction was cut off at max_tokens — invoice has too many lines for one call");
    }
    if (!response.parsed_output) {
      throw new Error("Claude returned no parseable extraction");
    }
    return response.parsed_output;
  }
}
