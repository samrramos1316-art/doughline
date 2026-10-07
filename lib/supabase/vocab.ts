import { cache } from "react";
import { createClient } from "./server";
import { resolveIndustry, type ResolvedIndustry, type Vocab } from "@/lib/industries";

// The signed-in org's industry profile (lib/industries), with its
// industry_settings overrides, read once per request and shared by the
// layout and the page. RLS limits organizations to the user's own.
export const getIndustry = cache(async (): Promise<ResolvedIndustry> => {
  const supabase = await createClient();
  const { data } = await supabase.from("organizations").select("business_type, industry_settings").maybeSingle();
  return resolveIndustry(data?.business_type, data?.industry_settings);
});

export const getVocab = cache(async (): Promise<Vocab> => (await getIndustry()).vocab);
