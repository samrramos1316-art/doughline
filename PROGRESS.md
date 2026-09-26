# Progress

Snapshot of what's been built and tested so far, against the build order in
`ARCHITECTURE.md` §13. Commit hashes below are on `main`.

## Steps 1-4 — backend + dashboard (real data, real Supabase)

- **Step 1 — schema** (`9fd955d`): migrations `001`-`011` — organizations,
  profiles, vendors, ingredients, invoices, invoice_line_items,
  vendor_ingredient_aliases, recipes, recipe_ingredients, menu_items,
  price_alerts, RLS policies, `recipe_costs`/`menu_item_margins` views,
  commodity_price_series, menu_item_margin_impacts.
  - Tested: `scripts/test-rls-isolation.mjs` creates two orgs and proves org A
    cannot read org B's rows, via a script against real Supabase.
- **Step 2 — auth + org creation** (`970be37`): `handle_new_user()` Postgres
  trigger creates an org+profile atomically on signup (chosen over a
  server-action approach for atomicity, and so it fires regardless of
  signup path).
  - Tested: `scripts/test-signup-org-creation.mjs` creates users via the raw
    Admin API and confirms each gets a separate org row, including the
    no-metadata default-name fallback.
- **Step 3 — CRUD + costing** (`02e05ec`): ingredient/recipe/menu-item CRUD
  routes and forms; `recipe_costs`/`menu_item_margins` are always-live DB
  views, no cache/recompute job.
  - Tested: `scripts/test-costing-views.mjs` hand-computes expected
    cost-per-serving and margin for a test recipe and asserts the views
    return the same numbers.
- **Step 4 — dashboard visual layer** (`13db2aa`): `MarginHealthBadge`,
  `TrendSparkline`, `MenuItemCard`, dashboard grid; demo data seeded via
  `scripts/seed-demo-data.mjs` (`demo@doughline.test` / `DoughlineDemo123!`).
  - Verified: build/lint clean, routes smoke-tested; visual/interaction
    quality was explicitly left for manual review, not self-verified.

## Steps 5-11 UI — mock screens, built ahead of backend wiring (`8f29a56`)

Per your explicit call to reverse the usual order, the visual layer for the
remaining screens was built first against hardcoded mock data
(`lib/mock/{invoices,alerts,market}.ts`), with no real AI calls:

- Invoice scan screen + invoice list/detail pages.
- Swipe-to-verify UI (`components/swipe/SwipeCard.tsx`, `SwipeDeck.tsx`) —
  real pointer-drag gesture, fake candidate matches.
- Alerts page + alert detail with margin-impact table.
- Suggestions display (`SuggestionsPanel`) — fake deterministic suggestions
  + fake AI-narrative paragraph.
- Market Watch panel — fake commodity trend cards.

Verified: build/lint clean, all routes smoke-tested (HTTP 200, no crash) via
scripted requests; visual/interaction feel was intentionally left for manual
review.

## Step 5 — real invoice capture (`abf1348`)

`ScanInvoiceClient` now does a real upload: compress the photo client-side
(canvas resize to ~1600px, JPEG q0.7), upload to the private `invoices`
Storage bucket at `{org_id}/{invoice_id}.jpg` (RLS-scoped per org — migration
`013_invoice_storage.sql`), then `POST /api/invoices` creates the row with
`status: pending`. No AI calls.

Tested: `scripts/test-invoice-upload.mjs` — against real Supabase, uploads
and downloads a test file through Storage RLS, confirms a cross-org write is
rejected, then drives the actual running route (via a reconstructed session
cookie) and confirms the resulting `invoices` row. 8/8 assertions pass.

## Step 6 — VisionProvider scaffold (`e86f518`)

- `lib/ai/vision/{types,gemini,claude,index}.ts` implement the §5.1 provider
  interface, switched via `VISION_PROVIDER=gemini|claude`. Neither provider
  makes a real API call yet — no key configured — each returns a fixed stub
  result with a `// TODO: needs GEMINI_API_KEY` / `CLAUDE_API_KEY` marking
  exactly where the real call goes.
- `POST /api/invoices/[id]/scan` wires the real, non-AI parts of §5.2 step 4:
  fetch the file from Storage, call the active provider, persist
  `raw_extraction`, apply the documented status transitions. Per-line-item
  normalization, Voyage embeddings, and alias/vector matching (§5.2 step 5)
  are explicitly **not** wired yet.

Tested: `scripts/smoke-test-scan-route.mjs` proves the plumbing runs
end-to-end without crashing; since the stub always returns zero line items,
the correct asserted outcome is `status: 'failed'` with `raw_extraction`
persisted.

## Not started yet

- Real Gemini/Claude vision calls (needs `GEMINI_API_KEY` or `CLAUDE_API_KEY`
  in `.env.local` — links and tradeoffs discussed, key not yet added as of
  this snapshot).
- Voyage embeddings + alias/vector matching (§5.2 step 5) — needs
  `VOYAGE_API_KEY`.
- Step 7 (matching/swipe UI wired to real data) — explicitly on hold per
  your instruction not to start without you.
- Commodity price ingestion job, bulk/PDF import, manual-entry grid, CSV
  import/export, PWA polish.

## Test scripts (all repeatable against real Supabase)

- `scripts/test-rls-isolation.mjs`
- `scripts/test-signup-org-creation.mjs`
- `scripts/test-costing-views.mjs`
- `scripts/test-invoice-upload.mjs`
- `scripts/smoke-test-scan-route.mjs`
- `scripts/seed-demo-data.mjs` (idempotent demo data, not a test)

Shared helpers: `scripts/lib/supabaseTestEnv.mjs` (Supabase admin/anon
clients), `scripts/lib/devServer.mjs` (starts/waits/kills a real `next dev`
instance for route-level tests — kills the whole process tree, not just the
shell wrapper, which a Windows-specific bug in the first version of this
helper failed to do).
