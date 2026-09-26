// Prints, straight from Supabase, what a scan persisted for one invoice: the
// invoices row (including raw_extraction) and every invoice_line_items row.
// Uses the service-role client, so it reads the tables directly (no RLS, no
// app code in between).
//
// Run: node scripts/query-invoice-scan.mjs <invoice_id>
import { getAdminClient } from "./lib/supabaseTestEnv.mjs";

const invoiceId = process.argv[2];
if (!invoiceId) throw new Error("usage: node scripts/query-invoice-scan.mjs <invoice_id>");

const admin = getAdminClient();

const { data: invoice, error: invoiceErr } = await admin
  .from("invoices")
  .select("*")
  .eq("id", invoiceId)
  .single();
if (invoiceErr) throw new Error("invoices query failed: " + invoiceErr.message);

console.log(`=== invoices row (select * where id = '${invoiceId}') ===`);
console.log(JSON.stringify(invoice, null, 2));

const { data: lineItems, error: lineErr } = await admin
  .from("invoice_line_items")
  .select("*")
  .eq("invoice_id", invoiceId)
  .order("created_at", { ascending: true });
if (lineErr) throw new Error("invoice_line_items query failed: " + lineErr.message);

console.log(`\n=== invoice_line_items (select * where invoice_id = '${invoiceId}') — ${lineItems.length} rows ===`);
console.log(JSON.stringify(lineItems, null, 2));
