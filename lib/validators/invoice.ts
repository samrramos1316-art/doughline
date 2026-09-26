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
