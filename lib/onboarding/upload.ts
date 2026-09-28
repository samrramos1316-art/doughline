import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// §9.3 onboarding files ride the invoice upload path: the browser uploads to
// the private `invoices` bucket under `{org_id}/onboarding/…` (Storage RLS
// keys on the first folder being the caller's org), then passes the path.
export const ONBOARDING_FOLDER = "onboarding";

const MIME: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: "application/pdf" };

export async function readOnboardingUpload(supabase: SupabaseClient<Database>, orgId: string, body: unknown) {
  const path = typeof body === "object" && body && "file_storage_path" in body ? String((body as { file_storage_path: unknown }).file_storage_path) : "";
  if (!path.startsWith(`${orgId}/${ONBOARDING_FOLDER}/`) || path.includes("..")) {
    return { error: "Expected { file_storage_path } for a file uploaded to your onboarding folder", status: 400 as const };
  }
  const mimeType = MIME[path.split(".").pop()?.toLowerCase() ?? ""];
  if (!mimeType) return { error: "Upload a photo (JPG, PNG, WebP) or a PDF", status: 400 as const };

  const { data: blob, error } = await supabase.storage.from("invoices").download(path);
  if (error || !blob) return { error: "Could not read the uploaded file", status: 400 as const };
  return { buffer: Buffer.from(await blob.arrayBuffer()), mimeType };
}
