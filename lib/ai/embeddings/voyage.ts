// §5.2: Voyage embeddings for semantic matching of invoice lines to the
// org's ingredient list. voyage-3.5 returns 1024-dim vectors, matching the
// vector(1024) columns on ingredients and invoice_line_items.
//
// Deliberately symmetric — no input_type — for both invoice lines and
// ingredient names. Measured on real invoice lines vs. a real ingredient
// list: query/document mode compressed every score into ~0.53–0.78 with
// little gap between right answers and items missing from the list, and
// document/document inflated them (a missing "heavy cream" scored 0.94
// against Buttermilk — a wrong auto-match). Symmetric gave the only clean
// gap. Changing this means re-embedding every stored ingredient and line.

const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
export const EMBEDDING_MODEL = "voyage-3.5";
export const EMBEDDING_DIMENSIONS = 1024;
const MAX_BATCH = 1000; // Voyage's per-request input limit
// Rate-limited (429) requests are retried after Retry-After (or a backoff
// long enough to clear a per-minute window), a bounded number of times.
const MAX_ATTEMPTS = 4;
const DEFAULT_RETRY_MS = 21_000;

async function postWithRetry(body: string, apiKey: string): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(VOYAGE_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body,
    });
    if (res.status !== 429 || attempt >= MAX_ATTEMPTS) return res;
    const retryAfterSec = Number(res.headers.get("retry-after"));
    const waitMs = retryAfterSec > 0 ? retryAfterSec * 1000 : DEFAULT_RETRY_MS;
    console.warn(`[voyage] 429 rate-limited; retry ${attempt}/${MAX_ATTEMPTS - 1} in ${Math.round(waitMs / 1000)}s`);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) throw new Error("VOYAGE_API_KEY is not set");

  const vectors: number[][] = [];
  for (let start = 0; start < texts.length; start += MAX_BATCH) {
    const batch = texts.slice(start, start + MAX_BATCH);
    const res = await postWithRetry(JSON.stringify({ model: EMBEDDING_MODEL, input: batch }), apiKey);
    if (!res.ok) {
      throw new Error(`Voyage embeddings failed: HTTP ${res.status} ${await res.text()}`);
    }
    const body = (await res.json()) as { data: { index: number; embedding: number[] }[] };
    // Voyage returns one entry per input with its index; sort rather than
    // trusting response order.
    for (const item of [...body.data].sort((a, b) => a.index - b.index)) {
      vectors.push(item.embedding);
    }
  }
  return vectors;
}

// What each side's embedding is computed from. Kept here so the routes, the
// matcher and scripts/backfill-ingredient-embeddings.mjs stay in step.
export function ingredientEmbeddingText(ingredient: { name: string }): string {
  return ingredient.name;
}

export function lineItemEmbeddingText(line: { raw_text: string; item_name: string | null }): string {
  return line.item_name?.trim() || line.raw_text;
}

// pgvector accepts its '[1,2,3]' text form over PostgREST.
export function toPgVector(vector: number[]): string {
  return JSON.stringify(vector);
}
