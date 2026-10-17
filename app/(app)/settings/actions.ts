"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";
import { isIndustryEnabled } from "@/lib/industries/gate";
import { INDUSTRY_IDS } from "@/lib/industries";
import { marginFromMarkup } from "@/lib/costing/markup";

export type SettingsState = { ok: true } | { error: string } | null;

const schema = z.object({
  name: z.string().trim().min(1, "Business name can't be empty").max(120),
  // Margin, or markup (migration 030): a markup also stores its margin
  // (2× = 50%) so anything reading only target_margin_pct agrees.
  pricing_style: z.enum(["margin", "markup"]).default("margin"),
  target_margin_pct: z.coerce.number().min(1).max(99).optional(),
  target_markup: z.coerce.number().min(1.05, "A markup has to be more than 1×").max(100, "Markup can be at most 100×").optional(),
  price_alert_threshold_pct: z.coerce.number().min(0.5).max(100),
  max_unreviewed_line_items: z.coerce.number().int().min(1).max(500),
  // Recipes that log labor time and set no rate of their own use this
  // (migration 025). Blank = 0 = labor isn't costed.
  default_labor_rate_per_hour: z.coerce.number().min(0, "Labor rate can't be negative").max(999999).optional(),
  // Jobs that log machine time with no rate of their own (migration 029).
  // Only on the form for industries that use it; left out = unchanged.
  default_machine_rate_per_hour: z.coerce.number().min(0, "Machine rate can't be negative").max(999999).optional(),
  // "" = Other / prefer not to say. Left out (an older form) = unchanged.
  business_type: z.union([z.literal(""), z.enum(INDUSTRY_IDS)]).optional(),
});

export async function saveSettingsAction(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the values" };
  const supabase = await createClient();
  const orgId = await getCurrentOrgId(supabase);
  if (!orgId) return { error: "Not signed in" };
  const { business_type, pricing_style, target_markup, target_margin_pct, ...rest } = parsed.data;
  const update: typeof rest & { business_type?: string | null; target_margin_pct?: number; target_markup?: number | null } = rest;
  if (pricing_style === "markup") {
    if (target_markup == null) return { error: "Enter your target markup" };
    update.target_markup = target_markup;
    update.target_margin_pct = Math.round(marginFromMarkup(target_markup) * 100) / 100;
  } else {
    if (target_margin_pct == null) return { error: "Enter your target margin" };
    update.target_margin_pct = target_margin_pct;
    update.target_markup = null;
  }
  if (business_type !== undefined) {
    // An industry that isn't offered (ENABLED_INDUSTRIES) can be kept, not chosen.
    const { data: current } = await supabase.from("organizations").select("business_type").eq("id", orgId).single();
    if (business_type !== (current?.business_type ?? "") && !isIndustryEnabled(business_type)) {
      return { error: "That kind of business isn't available yet." };
    }
    // "Other / prefer not to say" covers both null and a stored "other"; keep whichever it was.
    update.business_type = business_type || (current?.business_type === "other" ? "other" : null);
  }
  const { error } = await supabase
    .from("organizations")
    .update({ ...update, updated_at: new Date().toISOString() })
    .eq("id", orgId);
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}
