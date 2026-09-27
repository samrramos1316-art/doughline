import Anthropic from "@anthropic-ai/sdk";
import type { AlertSuggestions } from "./engine";

export const NARRATIVE_MODEL = "claude-opus-5";

const SYSTEM_PROMPT = `You write the short "what should I do about this?" note on a price alert inside a food-costing app for a small bakery or restaurant owner. They read it on a phone between tasks.

You get one ingredient price change, every menu item it affected (margin before and after), and options already calculated by the app for each item: a new menu price, and a smaller portion of the ingredient that moved. Those numbers are correct — your job is to weigh them, not redo them.

- One paragraph, 3–5 sentences, plain words, no headings or bullet points, no markdown.
- Lead with what matters most: which item took the biggest hit, and whether any item fell below the owner's target margin. If everything is still above target, say so plainly — the owner may reasonably choose to absorb the change.
- Weigh the tradeoff for this specific kind of item: customers notice a smaller portion of the signature ingredient (e.g. less butter in a croissant) more than a small price bump, and vice versa for a minor ingredient. Say which option you'd lean toward and why.
- Only use numbers that appear in the data you're given, written the same way (e.g. $5.02, 88.64%, 2.82 oz). Do not calculate new numbers, totals, or percentages.
- Don't mention suppliers, substitutes, or anything the data doesn't cover.`;

// §8: one Claude call per alert — not per menu item — over the structured
// before/after numbers and the deterministic options, asking for a short
// paragraph weighing the tradeoff. Claude isn't extracting or inventing
// numbers here, only explaining ones already computed.
export async function generateAlertNarrative(s: AlertSuggestions): Promise<string> {
  const apiKey = process.env.CLAUDE_API_KEY;
  const client = apiKey ? new Anthropic({ apiKey }) : new Anthropic();

  const response = await client.messages.create({
    model: NARRATIVE_MODEL,
    max_tokens: 4000,
    thinking: { type: "adaptive" },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: JSON.stringify(narrativeFacts(s), null, 2) }],
  });

  if (response.stop_reason === "refusal") throw new Error("Claude declined to write this narrative");
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  if (!text) throw new Error(`Claude returned no narrative (stop_reason ${response.stop_reason})`);
  return text;
}

// The exact facts Claude sees, pre-formatted so any number it repeats is
// already in the owner-facing form.
export function narrativeFacts(s: AlertSuggestions) {
  const u = s.alert.base_unit;
  return {
    ingredient: s.alert.ingredient_name,
    price_change: `${money(s.alert.previous_unit_cost)}/${u} -> ${money(s.alert.new_unit_cost)}/${u} (${signed(s.alert.pct_change)}%)`,
    target_margin: `${s.target_margin_pct}%`,
    menu_items: s.items.map((i) => ({
      name: i.menu_item_name,
      sells_for: money(i.selling_price),
      margin_before: `${i.previous_margin_pct}%`,
      margin_after: `${i.new_margin_pct}%`,
      change: `${signed(round2(i.new_margin_pct - i.previous_margin_pct))} percentage points`,
      above_target: i.target_check.meets_target,
      goal: i.goal
        ? i.goal.kind === "target"
          ? `get back to the ${i.goal.margin_pct}% target`
          : `restore the ${i.goal.margin_pct}% margin it had before this price change (it's still above target)`
        : "none — margin didn't drop",
      option_raise_price: i.raise_price
        ? `raise the price from ${money(i.selling_price)} to ${money(i.raise_price.new_price)} (+${money(i.raise_price.increase)}, +${i.raise_price.increase_pct}%)`
        : null,
      option_reduce_portion:
        i.reduce_portion == null
          ? null
          : i.reduce_portion.feasible
            ? `use ${i.reduce_portion.reduce_by_display} less ${s.alert.ingredient_name.toLowerCase()} per batch (${i.reduce_portion.reduce_pct}% less than the recipe's ${i.ingredient_qty_per_batch} ${u})`
            : `not possible: ${i.reduce_portion.reason}`,
    })),
  };
}

// Numbers in the narrative that don't appear anywhere in the facts it was
// given — a cheap check that it explained rather than invented.
export function ungroundedNumbers(narrative: string, s: AlertSuggestions): string[] {
  const facts = JSON.stringify(narrativeFacts(s));
  const inFacts = new Set((facts.match(/\d+(?:\.\d+)?/g) ?? []).map(Number));
  return (narrative.match(/\d+(?:\.\d+)?/g) ?? []).filter((n) => !inFacts.has(Number(n)));
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);
function money(n: number) {
  return `$${n.toFixed(n < 1 ? 4 : 2)}`;
}
