"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";

export type SettingsState = { ok: true } | { error: string } | null;

const schema = z.object({
  name: z.string().trim().min(1, "Business name can't be empty").max(120),
  target_margin_pct: z.coerce.number().min(1).max(99),
  price_alert_threshold_pct: z.coerce.number().min(0.5).max(100),
  max_unreviewed_line_items: z.coerce.number().int().min(1).max(500),
});

export async function saveSettingsAction(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the values" };
  const supabase = await createClient();
  const orgId = await getCurrentOrgId(supabase);
  if (!orgId) return { error: "Not signed in" };
  const { error } = await supabase
    .from("organizations")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", orgId);
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}
