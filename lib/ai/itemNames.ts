import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

// Fast, text-only: this runs while the owner waits on "Save lines".
const MODEL = "claude-haiku-4-5";

const Schema = z.object({
  items: z.array(z.object({ index: z.number().int(), item_name: z.string().nullable() })),
});

const SYSTEM_PROMPT = `You expand supplier invoice line descriptions for a small food business into the plain-English, generic name of the product, as a cook would write it on an ingredient list: abbreviations expanded, no brand, pack size, case count, or item code (e.g. "ORG CHKN BRST 40# CS" -> "organic chicken breast", "BUTTER SWT UNSLTD 36/1#" -> "unsalted sweet butter"). If a description is already a plain name, return it lowercased. Use null only if you can't tell what the product is. Return one entry per input, with its index.`;

// §9.2: typed invoice lines get the same matching as scanned ones. Scans
// embed the vision model's plain-English item_name (§5.2 step 4 — raw
// distributor shorthand embeds too poorly to match); a person copying a
// paper invoice types the shorthand, so expand it the same way here.
// Best-effort by design: on any failure every name is null and matching
// falls back to the typed text — manual entry must work without AI (§9).
export async function expandItemNames(rawTexts: string[]): Promise<(string | null)[]> {
  if (rawTexts.length === 0) return [];
  try {
    const apiKey = process.env.CLAUDE_API_KEY;
    const client = apiKey ? new Anthropic({ apiKey }) : new Anthropic();
    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [
        { role: "user", content: JSON.stringify(rawTexts.map((raw_text, index) => ({ index, raw_text }))) },
      ],
      output_config: { format: zodOutputFormat(Schema) },
    });
    const out: (string | null)[] = rawTexts.map(() => null);
    for (const item of response.parsed_output?.items ?? []) {
      if (item.index >= 0 && item.index < out.length) out[item.index] = item.item_name?.trim() || null;
    }
    return out;
  } catch (err) {
    console.error("[item-names] expansion failed; matching on the typed text:", err);
    return rawTexts.map(() => null);
  }
}
