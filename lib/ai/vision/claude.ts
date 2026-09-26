import type { VisionProvider, VisionExtractionResult } from "./types";

// §5.1: Claude's structured-outputs API as the alternate provider. Not wired
// to a real call yet — CLAUDE_API_KEY (or ANTHROPIC_API_KEY) isn't in
// .env.local, and guessing at the exact request/response shape without being
// able to run it against the real service would just be a different kind of
// wrong. This returns a fixed stub so the rest of the pipeline (§5.2 step 4
// onward) can be built and exercised against a known shape.
export class ClaudeVisionProvider implements VisionProvider {
  async extractInvoice(fileBuffer: Buffer, mimeType: string): Promise<VisionExtractionResult> {
    void fileBuffer;
    void mimeType;
    // TODO: needs CLAUDE_API_KEY. Real implementation: call the Anthropic
    // Messages API with the file as an image/document content block and a
    // tool/output schema matching §5.3's JSON schema, then map the result
    // into VisionExtractionResult.
    return {
      vendor_name_guess: null,
      invoice_date_guess: null,
      invoice_number_guess: null,
      line_items: [],
    };
  }
}
