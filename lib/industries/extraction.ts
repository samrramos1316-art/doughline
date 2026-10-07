// The one place industry hints join a vision prompt — every provider
// (lib/ai/vision/*) calls this, so prompts stay provider-agnostic. Food
// profiles have no hints: their prompt is returned unchanged, byte for byte.
import { industryProfile, type ExtractionKind } from "./index.ts";

export function extractionHints(businessType: string | null | undefined, kind: ExtractionKind): string {
  return industryProfile(businessType).extraction[kind].trim();
}

export function withIndustryHints(basePrompt: string, hints: string | null | undefined): string {
  const h = hints?.trim();
  return h ? `${basePrompt}\n\nAbout this business (these take precedence over the food-business wording above):\n${h}` : basePrompt;
}
