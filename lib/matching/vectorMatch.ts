import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { embedTexts, lineItemEmbeddingText, toPgVector } from "@/lib/ai/embeddings/voyage";
import { normalizeRawText } from "./normalize";
import { AUTO_MATCH_THRESHOLD, REVIEW_THRESHOLD } from "./thresholds";

export const CANDIDATE_COUNT = 3;

export type CandidateMatch = { ingredient_id: string; name: string; similarity: number };

export type LineMatch = {
  raw_text_normalized: string;
  embedding: string; // pgvector text form, ready to insert
  match_status: "auto_matched" | "needs_review" | "new_ingredient";
  matched_ingredient_id: string | null;
  match_confidence: number | null;
  candidate_matches: CandidateMatch[] | null;
  matched_by: "alias" | "vector" | "none";
};

// Matches a batch of invoice lines (same invoice, so same vendor) against
// the caller's ingredients, in §5.2 step 5's order:
//   a. exact vendor alias → auto_matched at confidence 1.0
//   b. otherwise vector search → top CANDIDATE_COUNT ingredients
//   c. route on the top similarity.
// The alias key is the verbatim print (normalized); the embedding is of the
// plain-English item_name, falling back to the print when there isn't one.
// Every line is embedded (one Voyage call for the batch) whether or not an
// alias hits, so invoice_line_items.embedding is always populated (§5.2 step 4).
export async function matchLines(
  supabase: SupabaseClient<Database>,
  { vendorId, lines }: { vendorId: string | null; lines: { raw_text: string; item_name: string | null }[] },
): Promise<LineMatch[]> {
  const normalized = lines.map((l) => normalizeRawText(l.raw_text));
  const vectors = await embedTexts(lines.map(lineItemEmbeddingText));

  let aliasQuery = supabase
    .from("vendor_ingredient_aliases")
    .select("id, raw_text_normalized, ingredient_id, times_used")
    .in("raw_text_normalized", normalized);
  aliasQuery = vendorId ? aliasQuery.eq("vendor_id", vendorId) : aliasQuery.is("vendor_id", null);
  const { data: aliases, error: aliasErr } = await aliasQuery;
  if (aliasErr) throw new Error("alias lookup failed: " + aliasErr.message);
  const aliasByText = new Map((aliases ?? []).map((a) => [a.raw_text_normalized, a]));

  return Promise.all(
    normalized.map(async (text, i): Promise<LineMatch> => {
      const embedding = toPgVector(vectors[i]);

      const alias = aliasByText.get(text);
      if (alias) {
        await supabase
          .from("vendor_ingredient_aliases")
          .update({ times_used: alias.times_used + 1 })
          .eq("id", alias.id);
        return {
          raw_text_normalized: text,
          embedding,
          match_status: "auto_matched",
          matched_ingredient_id: alias.ingredient_id,
          match_confidence: 1,
          candidate_matches: null,
          matched_by: "alias",
        };
      }

      const { data: candidates, error } = await supabase.rpc("match_ingredients", {
        query_embedding: embedding,
        match_count: CANDIDATE_COUNT,
      });
      if (error) throw new Error("match_ingredients failed: " + error.message);

      const rounded: CandidateMatch[] = (candidates ?? []).map((c) => ({
        ingredient_id: c.ingredient_id,
        name: c.name,
        similarity: Math.round(c.similarity * 1000) / 1000,
      }));
      const top = rounded[0];

      if (!top || top.similarity < REVIEW_THRESHOLD) {
        return {
          raw_text_normalized: text,
          embedding,
          match_status: "new_ingredient",
          matched_ingredient_id: null,
          match_confidence: top?.similarity ?? null,
          // Kept for audit/tuning, and so the swipe card can offer any at or
          // above SUGGESTION_DISPLAY_THRESHOLD as a low-confidence suggestion.
          candidate_matches: rounded.length ? rounded : null,
          matched_by: rounded.length ? "vector" : "none",
        };
      }

      const autoMatched = top.similarity >= AUTO_MATCH_THRESHOLD;
      return {
        raw_text_normalized: text,
        embedding,
        match_status: autoMatched ? "auto_matched" : "needs_review",
        matched_ingredient_id: autoMatched ? top.ingredient_id : null,
        match_confidence: top.similarity,
        candidate_matches: rounded,
        matched_by: "vector",
      };
    }),
  );
}
