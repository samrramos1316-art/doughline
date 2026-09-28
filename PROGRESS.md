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

## Real Claude vision (`c822426`, `90791d6`)

`lib/ai/vision/claude.ts` calls `claude-opus-5` with structured outputs
(§5.3 schema as Zod). `VISION_PROVIDER=claude`; Gemini is still a stub.

Tested: `scripts/test-claude-vision-scan.mjs` — photographed Sysco invoice
fixture through the real scan route; every field matches the print.

## Step 7 — matching, confidence routing, swipe-to-verify, review gate

- Migrations `015_matching.sql` (`match_ingredients()` exact per-org vector
  search; trigger refusing `completed` with unresolved lines) and
  `016_line_item_item_name.sql` (`parsed_item_name`). `014` (margin fix)
  also applied.
- `lib/ai/embeddings/voyage.ts` (voyage-3.5, symmetric, retries 429s),
  `lib/matching/{normalize,vectorMatch,vendors,review,queue}.ts`.
- Scan route: vendor resolution → alias check → embed Claude's `item_name`
  → vector search → routing (auto ≥ 0.90, review ≥ 0.75, else new).
  Swipe card hides candidates below 0.65 ("No match found": create new or
  search); 0.65–0.75 shows as a low-confidence suggestion. Display only.
- `POST /api/line-items/[id]/{confirm,reject,create-ingredient}`; ingredient
  create/rename embeds server-side; `scripts/backfill-ingredient-embeddings.mjs`.
- Real-data UI: invoices list/detail, `/invoices/[id]/review`, org-wide
  `/review`, swipe deck with picker + add-new form, Action Required
  interstitial, 423 on new scans over the cap. Mock invoice data removed.
- Confirm deliberately stops at the alias: no price history, cost update,
  or alerts — that's step 8.
- Design change from the original plan, driven by measurements on real
  data: embeddings are of Claude's plain-English `item_name`, not the raw
  print (ARCHITECTURE.md §5.2). The review bar stays at the spec's 0.75.

Tested: `scripts/test-matching-e2e.mjs` — real Claude + Voyage + Supabase,
headless Edge driving the real swipe UI with pointer drags; screenshots to
`test-output/matching/`. All assertions pass, including matching quality
(no wrong auto-matches, no missed in-list items).

## Step 8 — price history, price alerts, margin-impact cascade

- Migration `017_price_cascade.sql`: pack-size + price-outcome columns on
  `invoice_line_items`; `apply_line_item_price()` does history → cost update
  → (past `price_alert_threshold_pct`, either direction) `price_alerts` +
  one `menu_item_margin_impacts` row per active menu item, before/after read
  from the `menu_item_margins` view in one transaction. Idempotent per line.
- Claude now extracts `pack_quantity`/`pack_unit`; `lib/costing/units.ts`
  converts per-case invoice prices to the ingredient's base unit; lines that
  can't be converted get a `price_note` instead of a guessed cost.
- `lib/costing/applyPrice.ts` runs on confirm, create-ingredient, and for
  auto-matched lines at scan time.
- `/alerts` and `/alerts/[id]` read real rows (mock alerts now only back the
  step 9 `SuggestionsPanel`); invoice page shows the cost applied per line.

Tested: `scripts/test-price-cascade-e2e.mjs` — real Claude + Voyage +
Supabase: pack sizes read correctly, auto-matched prices applied at scan,
sub-threshold confirms update cost with no alert, butter +16.47% creates the
alert and 3 impact rows whose before/after margins equal an independent JS
calculation and the live view; excludes the non-butter recipe and the
inactive item; re-confirm is a no-op; new ingredient's first price doesn't
alert; `/alerts` pages screenshot-verified.

## Step 9 — suggestion engine

- `lib/suggestions/math.ts` (pure): raise-price and reduce-portion per §8.
  Goal = org target when below it, else the pre-alert margin when it
  dropped (the target formula would say "cut the price" for items already
  above target). Prices round up to the cent; infeasible cuts reported.
- `lib/suggestions/engine.ts` + `GET /api/alerts/[id]/suggestions`.
- `lib/suggestions/narrative.ts` + `POST /api/alerts/[id]/narrative`: one
  Claude call per alert, cached on `price_alerts` (migration `018`).
- `/alerts/[id]` shows suggestion cards + the AI summary (fetched
  client-side, so the math never waits on Claude). Mock alerts deleted.

Tested: `scripts/test-suggestions-e2e.mjs --org=<id>` on the verified
butter alert — every price/portion number matches an independent
calculation and lands on its goal margin when applied to the real recipe
rows; the below-target branch exercised on the same rows (target 88%);
real Claude narrative printed verbatim, all its numbers grounded in the
data; cached on second request; page screenshot-verified.

## Step 10 — bulk/PDF import, manual-entry grid, CSV

- `/invoices/import` + `POST /api/invoices/bulk`: multi-file drag-and-drop
  (photos + PDFs), queue-read one at a time, resumable; failed ones link
  to manual entry.
- Migration `019`: prices from invoices older than the newest price on file
  go to history only (no current-cost rollback, no alert). `020`: line
  `position` so lines keep invoice order.
- `components/grid/EditableGrid.tsx` behind three screens: invoice manual
  entry (`/invoices/[id]/manual-entry`, `POST /api/invoices/[id]/line-items`,
  `PATCH /api/line-items/[id]`, `PATCH /api/invoices/[id]`), the ingredient
  list (+ `GET /api/ingredients/export`, `POST /api/ingredients/import`),
  and recipe ingredients.
- Typed shorthand is expanded by `lib/ai/itemNames.ts` (Haiku, best-effort)
  so manual lines match as well as scanned ones.
- Scan route refuses a second scan of an invoice (409); `lib/invoices/lines.ts`
  is the shared scan/manual pipeline.

Tested: `scripts/test-bulk-import-e2e.mjs` (fixtures from
`scripts/make-step10-fixtures.mjs`) — real PDF + unreadable photo through
the real import UI; July prices stored as history only; the failed invoice
filled via Tab-typing + clipboard paste in the grid, a line-total typo
blocked inline, saved, matched, and a typed price raising a real alert;
ingredient grid edit/paste/validation; CSV export → edit → import and a bad
CSV rejected whole; recipe grid paste with costs checked by hand.

## Step 11 — commodity ingestion + Market Watch

- `lib/market/series.ts`: USDA MyMarketNews (eggs — report 2843, CME
  butter — 1603, KC HRW wheat — 3223) + FAO Food Price Index CSV (6 series).
- `GET /api/cron/ingest-market-data` (Vercel Cron daily, `CRON_SECRET`),
  service-role writes via `lib/supabase/admin.ts` (`server-only`).
- `lib/market/trends.ts`: stateless % change over 30/90/180 days;
  `lib/market/categoryDefaults.ts` maps ingredients to series.
- `/market` page + compact panel on the dashboard. Mock market data deleted.

Tested: `scripts/test-market-e2e.mjs` — cron auth, live ingestion of all 9
series, a stored egg row equal to USDA's own number from a direct API call,
idempotent re-run, ingredient mapping (override, name, category), and every
displayed % change recomputed independently from stored rows (90 and 30
days); screenshots in `test-output/market/`.

## Step 12 — PWA (installable app, offline screen)

- Icons drawn in `scripts/make-icons.mjs` (the logo's loaf, with its score
  line as a rising price line) and rendered to PNG/ICO in headless Edge:
  192/512 "any", 512 maskable, 180 Apple, SVG tab icon, favicon.ico.
- `app/manifest.ts`: opens `/dashboard` full screen; long-press shortcuts to
  Scan, Review and Market. iOS home-screen tags in `app/layout.tsx`.
- `public/sw.js`: never caches pages or data (prices stay live). It only
  serves `/offline` when a page can't load, and keeps Next's hashed static
  files and the icons. Registered in production builds only.
- `components/pwa/InstallPrompt.tsx`: Install card in the app when the
  browser offers install (Chrome/Edge/Android); Share → Add to Home Screen
  steps on iPhone Safari. Not now hides it for 30 days.
- Tested by `scripts/test-pwa-e2e.mjs`: manifest + icon sizes, head tags,
  SW active, Chrome reports no installability errors, offline screen from
  cache then auto-reload on reconnect, only `/offline` cached, install card.

## Security fix — costing views leaked across orgs (migration `021`)

- `recipe_costs` and `menu_item_margins` were plain views owned by
  `postgres`, so they skipped RLS: any signed-in user could read every org's
  recipe costs and menu margins. Found when a brand-new signup's dashboard
  showed the demo org's menu. Both are now `security_invoker`; a fresh
  account sees 0 rows, owners still see theirs.
- `scripts/test-rls-isolation.mjs` now checks both views both ways.
- Supabase "Confirm email" is off (Supabase's mailer couldn't deliver to
  real users); signup → dashboard → log out → log in verified on the live site.

## Not started yet

- Gemini vision provider (needs `GEMINI_API_KEY`).

## Known issues

- Email confirmation is off, so anyone can sign up with an address they
  don't own. Before real customers: set up custom SMTP (Supabase →
  Authentication → Emails) and turn "Confirm email" back on. The app already
  handles that flow (check-email screen, unconfirmed-login message + resend,
  /auth/confirm).

- Voyage account has no payment method → 3 requests/min. Scans and "Add
  new" wait on 429 retries (a re-scan took ~53s instead of ~10s).
- `scripts/smoke-test-scan-route.mjs` is stale: written for the stub
  provider, it sends random bytes and now fails against real Claude.
- Costing views assume recipe quantities are in the ingredient's base unit
  (`recipe_ingredients.unit` isn't converted yet).

## Test scripts (all repeatable against real Supabase)

- `scripts/test-rls-isolation.mjs`
- `scripts/test-signup-org-creation.mjs`
- `scripts/test-costing-views.mjs`
- `scripts/test-invoice-upload.mjs`
- `scripts/smoke-test-scan-route.mjs` (stale — see Known issues)
- `scripts/test-claude-vision-scan.mjs`
- `scripts/test-matching-e2e.mjs`
- `scripts/test-price-cascade-e2e.mjs`
- `scripts/test-suggestions-e2e.mjs` (needs `KEEP_FIXTURES=1` output of the above)
- `scripts/test-bulk-import-e2e.mjs`
- `scripts/test-market-e2e.mjs` (live USDA + FAO)
- `scripts/test-auth-e2e.mjs [--base=https://…]` (login/signup/confirm flows, landing page)
- `scripts/test-pwa-e2e.mjs [--base=https://…]` (after `npm run build`; manifest, icons, service worker, offline, install card)
- `scripts/make-icons.mjs` (regenerates the app icons, not a test)
- `scripts/query-invoice-scan.mjs` (inspect one invoice's rows, not a test)
- `scripts/seed-demo-data.mjs` (idempotent demo data, not a test)

Shared helpers: `scripts/lib/supabaseTestEnv.mjs` (Supabase admin/anon
clients), `scripts/lib/devServer.mjs` (starts/waits/kills a real `next dev`
instance for route-level tests — kills the whole process tree, not just the
shell wrapper, which a Windows-specific bug in the first version of this
helper failed to do).
