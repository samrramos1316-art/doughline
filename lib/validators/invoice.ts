import { z } from "zod";

// `id` is client-supplied (not DB-defaulted) because the client must know the
// invoice id before it uploads the file — the Storage path embeds it
// (`{org_id}/{invoice_id}.{ext}`, §5.2 step 2) and the file has to land in
// Storage before this row is created (§4 API table).
export const createInvoiceSchema = z.object({
  id: z.string().uuid(),
  file_storage_path: z.string().min(1),
  file_type: z.enum(["image", "pdf"]).default("image"),
  vendor_id: z.string().uuid().optional().nullable(),
});

// §9.1 bulk backfill: many invoices, one request. Same client-supplied ids
// as the single-scan path, for the same reason.
export const BULK_IMPORT_MAX = 25;
export const bulkCreateInvoicesSchema = z.object({
  invoices: z
    .array(createInvoiceSchema.omit({ vendor_id: true }))
    .min(1)
    .max(BULK_IMPORT_MAX, `At most ${BULK_IMPORT_MAX} files per import`),
});

// Header fields an owner types when the scan couldn't read them (§9.2).
export const updateInvoiceSchema = z.object({
  vendor_name: z.string().trim().min(1).max(200).nullable().optional(),
  invoice_number: z.string().trim().max(100).nullable().optional(),
  invoice_date: z.iso.date().nullable().optional(),
});
