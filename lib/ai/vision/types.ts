// §5.1 provider abstraction — the shape every vision provider returns,
// regardless of which model produced it.
export interface ExtractedLineItem {
  raw_text: string;
  // Plain-English generic product name ("ORG CHKN BRST 40# CS" -> "organic
  // chicken breast"). This, not raw_text, is what gets embedded for
  // ingredient matching — distributor shorthand carries too little meaning
  // for embeddings to rank reliably (see lib/matching/vectorMatch.ts).
  item_name: string | null;
  quantity: number | null;
  unit: string | null;
  unit_cost: number | null;
  line_total: number | null;
  // Size of ONE invoice unit as printed in the description ("36/1#" → 36
  // lb), so a per-case price can be converted to the ingredient's base unit
  // (lib/costing/units.ts). null when nothing is printed.
  pack_quantity: number | null;
  pack_unit: string | null;
}

// What the uploaded page actually is. Every reader decides it, whichever
// box it was uploaded to: only the matching kind is extracted, and a
// mismatch is routed to the right import (§9.3) instead of being misread.
export type DocumentType = "invoice" | "menu" | "recipe" | "other";

export interface VisionExtractionResult {
  document_type: DocumentType;
  vendor_name_guess: string | null;
  invoice_date_guess: string | null; // ISO date
  invoice_number_guess: string | null;
  invoice_total_guess: number | null; // grand total due, as printed
  line_items: ExtractedLineItem[];
}

// §9.3 onboarding import: a menu (board, printed card, PDF) → items + prices.
export interface MenuExtractionResult {
  document_type: DocumentType;
  items: { name_guess: string; price_guess: number | null }[];
}

// §9.3 onboarding import: one recipe (card, notebook page, doc).
export interface RecipeIngredientLine {
  raw_text: string; // the line as written, e.g. "2 1/4 cups all-purpose flour"
  quantity_guess: number | null;
  unit_guess: string | null;
  // Plain-English ingredient name with no quantity/prep ("all-purpose
  // flour") — what matching embeds, for the same reason as an invoice line's
  // item_name (see ExtractedLineItem). Not in §9.3's shape; added so recipe
  // lines match as well as invoice lines do.
  item_name_guess: string | null;
}
export interface RecipeExtractionResult {
  document_type: DocumentType;
  name_guess: string | null;
  yield_qty_guess: number | null;
  yield_unit_guess: string | null;
  ingredient_lines: RecipeIngredientLine[];
}

export interface VisionProvider {
  extractInvoice(fileBuffer: Buffer, mimeType: string): Promise<VisionExtractionResult>;
  extractMenu(fileBuffer: Buffer, mimeType: string): Promise<MenuExtractionResult>;
  extractRecipe(fileBuffer: Buffer, mimeType: string): Promise<RecipeExtractionResult>;
}
