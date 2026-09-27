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
}

export interface VisionExtractionResult {
  vendor_name_guess: string | null;
  invoice_date_guess: string | null; // ISO date
  invoice_number_guess: string | null;
  line_items: ExtractedLineItem[];
}

export interface VisionProvider {
  extractInvoice(fileBuffer: Buffer, mimeType: string): Promise<VisionExtractionResult>;
}
