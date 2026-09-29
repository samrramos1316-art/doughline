import type { VisionProvider, VisionExtractionResult, MenuExtractionResult, RecipeExtractionResult } from "./types";

// §5.1: Gemini 2.5 Flash with a forced JSON response schema (§5.3). Not wired
// to a real call yet — GEMINI_API_KEY isn't in .env.local, and guessing at
// the exact request/response shape of Gemini's structured-output API without
// being able to run it against the real service would just be a different
// kind of wrong. This returns a fixed stub so the rest of the pipeline
// (§5.2 step 4 onward) can be built and exercised against a known shape.
export class GeminiVisionProvider implements VisionProvider {
  async extractInvoice(fileBuffer: Buffer, mimeType: string): Promise<VisionExtractionResult> {
    void fileBuffer;
    void mimeType;
    // TODO: needs GEMINI_API_KEY. Real implementation: call the Gemini API
    // (generateContent with a responseSchema matching §5.3's JSON schema),
    // passing fileBuffer as inline image/pdf data, and map its response into
    // VisionExtractionResult.
    return {
      document_type: "invoice",
      vendor_name_guess: null,
      invoice_date_guess: null,
      invoice_number_guess: null,
      invoice_total_guess: null,
      line_items: [],
    };
  }

  // Same stub treatment as extractInvoice (§9.3): nothing extracted, so the
  // onboarding screen falls back to "enter these by hand".
  async extractMenu(fileBuffer: Buffer, mimeType: string): Promise<MenuExtractionResult> {
    void fileBuffer;
    void mimeType;
    return { document_type: "menu", items: [] };
  }

  async extractRecipe(fileBuffer: Buffer, mimeType: string): Promise<RecipeExtractionResult> {
    void fileBuffer;
    void mimeType;
    return { document_type: "recipe", name_guess: null, yield_qty_guess: null, yield_unit_guess: null, ingredient_lines: [] };
  }
}
