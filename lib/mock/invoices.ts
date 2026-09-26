// Hardcoded mock data for the invoice/swipe-to-verify UI (no backend wiring
// yet — see the project owner's step 5-11 UI-first request). Field names
// mirror the real `invoices`/`invoice_line_items` columns (§3.4) so swapping
// this for a real Supabase query later is a drop-in replacement.

export type MockCandidateMatch = {
  ingredient_id: string;
  name: string;
  similarity: number;
};

export type MockLineItem = {
  id: string;
  raw_text: string;
  parsed_quantity: number | null;
  parsed_unit: string | null;
  parsed_unit_cost: number | null;
  parsed_line_total: number | null;
  match_status: "pending" | "auto_matched" | "needs_review" | "confirmed" | "rejected" | "new_ingredient";
  match_confidence: number | null;
  candidate_matches: MockCandidateMatch[] | null;
};

export type MockInvoice = {
  id: string;
  vendor_name: string;
  status: "pending" | "processing" | "needs_review" | "completed" | "failed";
  invoice_number: string | null;
  invoice_date: string | null;
  total_amount: number | null;
  source_type: "camera_scan" | "bulk_upload" | "manual_entry";
  created_at: string;
  line_items: MockLineItem[];
};

export const mockInvoices: MockInvoice[] = [
  {
    id: "inv-1",
    vendor_name: "Sysco",
    status: "completed",
    invoice_number: "SYS-88213",
    invoice_date: "2026-09-18",
    total_amount: 180.6,
    source_type: "camera_scan",
    created_at: "2026-09-18T14:02:00Z",
    line_items: [
      {
        id: "li-1", raw_text: "ORG CHKN BRST 40# CS", parsed_quantity: 1, parsed_unit: "case",
        parsed_unit_cost: 96.4, parsed_line_total: 96.4, match_status: "confirmed",
        match_confidence: 1.0, candidate_matches: null,
      },
      {
        id: "li-2", raw_text: "UNSLTD BUTTER 36/1LB", parsed_quantity: 1, parsed_unit: "case",
        parsed_unit_cost: 84.2, parsed_line_total: 84.2, match_status: "confirmed",
        match_confidence: 0.98, candidate_matches: null,
      },
    ],
  },
  {
    id: "inv-2",
    vendor_name: "US Foods",
    status: "needs_review",
    invoice_number: "USF-40218",
    invoice_date: "2026-09-22",
    total_amount: 155.35,
    source_type: "camera_scan",
    created_at: "2026-09-22T09:14:00Z",
    line_items: [
      {
        id: "li-3", raw_text: "AP FLR 50# BG", parsed_quantity: 1, parsed_unit: "bag",
        parsed_unit_cost: 24.5, parsed_line_total: 24.5, match_status: "auto_matched",
        match_confidence: 0.97, candidate_matches: null,
      },
      {
        id: "li-4", raw_text: "GRAN SUGAR 50#", parsed_quantity: 1, parsed_unit: "bag",
        parsed_unit_cost: 31.1, parsed_line_total: 31.1, match_status: "needs_review",
        match_confidence: 0.81,
        candidate_matches: [
          { ingredient_id: "ing-sugar", name: "Sugar", similarity: 0.81 },
          { ingredient_id: "ing-powdered-sugar", name: "Powdered Sugar", similarity: 0.74 },
          { ingredient_id: "ing-brown-sugar", name: "Brown Sugar", similarity: 0.69 },
        ],
      },
      {
        id: "li-5", raw_text: "LG WHL EGGS 15DZ", parsed_quantity: 15, parsed_unit: "dozen",
        parsed_unit_cost: 3.85, parsed_line_total: 57.75, match_status: "needs_review",
        match_confidence: 0.78,
        candidate_matches: [
          { ingredient_id: "ing-eggs", name: "Eggs", similarity: 0.78 },
          { ingredient_id: "ing-egg-whites", name: "Egg Whites (carton)", similarity: 0.61 },
        ],
      },
      {
        id: "li-6", raw_text: "MADAGASCAR VANILLA EXT 32OZ", parsed_quantity: 1, parsed_unit: "bottle",
        parsed_unit_cost: 42.0, parsed_line_total: 42.0, match_status: "new_ingredient",
        match_confidence: 0.42,
        candidate_matches: [{ ingredient_id: "ing-vanilla", name: "Vanilla Extract", similarity: 0.42 }],
      },
    ],
  },
  {
    id: "inv-3",
    vendor_name: "Restaurant Depot",
    status: "pending",
    invoice_number: null,
    invoice_date: null,
    total_amount: null,
    source_type: "camera_scan",
    created_at: "2026-09-25T18:40:00Z",
    line_items: [],
  },
  {
    id: "inv-4",
    vendor_name: "Restaurant Depot",
    status: "failed",
    invoice_number: null,
    invoice_date: "2026-09-20",
    total_amount: null,
    source_type: "camera_scan",
    created_at: "2026-09-20T11:05:00Z",
    line_items: [],
  },
];

export function getMockInvoice(id: string) {
  return mockInvoices.find((i) => i.id === id);
}
