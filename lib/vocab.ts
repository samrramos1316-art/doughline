// Display words by industry — read from the industry registry
// (lib/industries/index.ts). Unknown or missing business_type → today's food
// wording.
import { INDUSTRY_IDS, industryProfile, type Vocab } from "./industries/index.ts";

export type { Vocab };
export const BUSINESS_TYPES = INDUSTRY_IDS;
export type BusinessType = (typeof INDUSTRY_IDS)[number];

export function vocabFor(businessType: string | null | undefined): Vocab {
  return industryProfile(businessType).vocab;
}

// "Recipes" → "recipes" for use mid-sentence.
export const lower = (label: string) => label.toLowerCase();
