import type { VisionProvider } from "./types";
import { GeminiVisionProvider } from "./gemini";
import { ClaudeVisionProvider } from "./claude";

export type { VisionProvider, VisionExtractionResult, ExtractedLineItem, MenuExtractionResult, RecipeExtractionResult, RecipeIngredientLine } from "./types";

// Switching providers — or later running both and reconciling — is a
// one-line env change, not a rewrite (§5.1). Defaults to Claude: the Gemini
// provider is still a stub that extracts nothing, so defaulting to it made an
// unconfigured install silently send every scan to manual entry. Empty
// counts as unset.
export function getVisionProvider(): VisionProvider {
  const provider = process.env.VISION_PROVIDER || "claude";
  switch (provider) {
    case "gemini":
      return new GeminiVisionProvider();
    case "claude":
      return new ClaudeVisionProvider();
    default:
      throw new Error(`Unknown VISION_PROVIDER: ${provider}`);
  }
}
