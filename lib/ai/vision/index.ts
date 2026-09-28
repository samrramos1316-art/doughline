import type { VisionProvider } from "./types";
import { GeminiVisionProvider } from "./gemini";
import { ClaudeVisionProvider } from "./claude";

export type { VisionProvider, VisionExtractionResult, ExtractedLineItem, MenuExtractionResult, RecipeExtractionResult, RecipeIngredientLine } from "./types";

// Switching providers — or later running both and reconciling — is a
// one-line env change, not a rewrite (§5.1).
export function getVisionProvider(): VisionProvider {
  const provider = process.env.VISION_PROVIDER ?? "gemini";
  switch (provider) {
    case "gemini":
      return new GeminiVisionProvider();
    case "claude":
      return new ClaudeVisionProvider();
    default:
      throw new Error(`Unknown VISION_PROVIDER: ${provider}`);
  }
}
