// §5.1 provider abstraction — the shape every vision provider returns,
// regardless of which model produced it.
export interface ExtractedLineItem {
  raw_text: string;
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
