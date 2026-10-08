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

// "recipe" → "a recipe", "arrangement" → "an arrangement".
export const withArticle = (word: string) => `${/^[aeiou]/i.test(word) ? "an" : "a"} ${word}`;

// The document a business sells from, as a countable noun: "menu" for
// food, "product list" / "package list" / "quote list" for the trades
// (whose `menu` word is a plural page name).
export const menuDoc = (v: Vocab) => (v.menu === "Menu" ? "menu" : `${lower(v.menuItem)} list`);

// "a recipe" → "A recipe", for the start of a sentence or a heading.
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
