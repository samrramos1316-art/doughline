// Embeds every ingredient that has no embedding yet (created before step 7,
// or while Voyage was unreachable), so vector matching (§5.2 step 5b) can
// find it. Idempotent: only touches rows where embedding is null.
//
// Must embed exactly like lib/ai/embeddings/voyage.ts does for ingredients:
// model voyage-3.5, no input_type (symmetric), text = the ingredient name.
//
// Run: node scripts/backfill-ingredient-embeddings.mjs [--org=<org_id>]
import { getAdminClient, loadEnv } from "./lib/supabaseTestEnv.mjs";

loadEnv();
if (!process.env.VOYAGE_API_KEY) throw new Error("Set VOYAGE_API_KEY in .env.local");

const admin = getAdminClient();
const BATCH = 128;
const orgId = process.argv.find((a) => a.startsWith("--org="))?.slice("--org=".length);

let query = admin.from("ingredients").select("id, name").is("embedding", null);
if (orgId) query = query.eq("org_id", orgId);
const { data: missing, error } = await query;
if (error) throw new Error("query failed: " + error.message);
console.log(`${missing.length} ingredient(s) without an embedding`);

for (let start = 0; start < missing.length; start += BATCH) {
  const batch = missing.slice(start, start + BATCH);
  let res;
  for (let attempt = 1; attempt <= 4; attempt++) {
    res = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "voyage-3.5", input: batch.map((i) => i.name) }),
    });
    if (res.status !== 429 || attempt === 4) break;
    console.log(`Voyage 429 (rate limited) — waiting 21s before retry ${attempt}/3`);
    await new Promise((r) => setTimeout(r, 21_000));
  }
  if (!res.ok) throw new Error(`Voyage HTTP ${res.status}: ${await res.text()}`);
  const { data } = await res.json();

  for (const { index, embedding } of data) {
    const { error: updateErr } = await admin
      .from("ingredients")
      .update({ embedding: JSON.stringify(embedding) })
      .eq("id", batch[index].id);
    if (updateErr) throw new Error(`update ${batch[index].id} failed: ${updateErr.message}`);
  }
  console.log(`embedded ${start + batch.length}/${missing.length}`);
}

let remaining = admin.from("ingredients").select("id", { count: "exact", head: true }).is("embedding", null);
if (orgId) remaining = remaining.eq("org_id", orgId);
const { count } = await remaining;
console.log(`done — ingredients still without an embedding${orgId ? ` in org ${orgId}` : ""}: ${count}`);
