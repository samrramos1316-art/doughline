# DoughTally — Technical Architecture

**Product:** a lean, AI-powered back office for micro food businesses (home bakeries, food trucks, cafés, small caterers). It protects margins by automating supplier-invoice processing and tracking costs and margins in real time.

**About this document:** this started as the implementation spec DoughTally was built from. It covers the stack, database schema and migrations, API surface, the AI vision/matching pipeline, margin-change alerting, the commodity-price panel, the suggestion engine, manual-entry fallbacks and the codebase layout. It has since been updated to describe what was **actually built**. Where the code differs from the original plan, the difference is called out in a **"Built:"** note, and every difference is summarised in §0 below. When this document and the code disagree, the code (and the SQL in `supabase/migrations/`) wins.

---

## 0. Spec vs. build: where the code differs from the original plan

| Area | Original plan | What was built |
|---|---|---|
| Framework | Next.js 15, `middleware.ts` | **Next.js 16**, where middleware is renamed **`proxy.ts`** (root) → `lib/supabase/proxy.ts` (session refresh, auth redirects, access gate). |
| UI kit / data fetching | shadcn/ui, TanStack Query | **Neither is used.** Hand-built Tailwind 4 components plus Server Components and Server Actions; GSAP + Lenis on the landing page only. |
| Vision provider | Gemini 2.5 Flash default, Claude as alternative | **Claude is the only working provider** (`lib/ai/vision/claude.ts`, structured outputs). `lib/ai/vision/gemini.ts` is a **stub that returns no lines**. ⚠️ `VISION_PROVIDER` still **defaults to `gemini`** when unset, so a fresh install without `VISION_PROVIDER=claude` silently extracts nothing. |
| Extraction schema (§5.3) | vendor/date/number + `line_items` | Adds `document_type` (invoice vs. menu vs. recipe, used to route wrong-kind uploads), `invoice_total_guess`, per-line `item_name` (migration 016) and printed pack size (017). |
| Extra AI calls | Vision + one narrative call per alert | Also `lib/ai/itemNames.ts` (Claude Haiku: expands "BUTTER SWT UNSLTD 36/1#" → "unsalted sweet butter"; embeddings are computed from this, not from `raw_text`) and `lib/onboarding/reason.ts` (Claude: recipe/menu linking and unit judgements during onboarding import). |
| Org creation (§13 step 2) | Server action using the service role | **`handle_new_user` trigger on `auth.users`** (migration 012): org + profile are created in the same transaction as the user. |
| View security (§3.9) | "Views inherit RLS automatically" | **Wrong in the original plan.** Views run as their owner and bypassed RLS until **migration 021** recreated them `with (security_invoker = true)`. Any new view must do the same. |
| Margin cascade (§6.1) | App code (`lib/costing/marginImpact.ts`) | A **SQL function `apply_line_item_price()`** (migrations 017, 019), called from `lib/costing/applyPrice.ts`, does price history, current cost, alert and margin impacts in one transaction. Backdated invoices update history only (019). |
| Review gate (§6.3) | App rule | Enforced in the database by the `enforce_invoice_review_gate` trigger (015), plus `components/review/ActionRequiredGate.tsx` in the UI. |
| Matching thresholds (§5.2) | 0.90 / 0.75 | Kept (`lib/matching/thresholds.ts`), plus a display-only 0.65 floor for showing a low-confidence suggestion. |
| "Not an ingredient" | — | Added: gloves/fees/surcharges can be marked once per vendor phrase and are remembered (migration 022, `/api/line-items/[id]/not-ingredient`). |
| Costing correctness | — | Migration 014 honours `servings_per_batch`; 023 makes a recipe's cost unknown (not cheaper) while any ingredient is unpriced; 024 enforces one ingredient per name per org. |
| API surface (§4) | Full REST surface | Several read endpoints became Server Component data loads instead of routes; see the "Built" note under §4. Stripe webhook not built. |
| Pages (§11) | `ingredients/[id]`, `recipes/new` | Not built as separate pages. Added `add/` (one entry point for any photo import), `review/` (org-wide swipe queue), `margins/`, `alerts/[id]`, `admin/` (owner console) and marketing pages (`login`, `signup`, `privacy`, `terms`, `cookies`). |
| Access control | — | Added a pre-launch gate (`DOUGHTALLY_ACCESS=closed` + `DOUGHTALLY_ALLOWED_EMAILS`, `lib/access.ts`) and an owner console gated by `DOUGHTALLY_ADMIN_EMAILS` (`lib/admin/`). Both are enforced in the app, not in Supabase Auth. |
| Analytics | — | Vercel Web Analytics with scrubbed URLs (`components/analytics/SiteAnalytics.tsx`). |
| Seed data | `supabase/seed.sql` | No `seed.sql`. `scripts/seed-demo-data.mjs` seeds a demo account; `scripts/fixtures/` holds made-up businesses and invoices. |
| Tests | — | No unit-test runner. `scripts/test-*.mjs` are end-to-end scripts against a real Supabase project and a running server (RLS isolation, signup, costing views, scans, matching, cascade, bulk import, market, onboarding, PWA, access gate). |
| Billing | Stripe placeholder | `organizations.subscription_tier` / `stripe_customer_id` columns exist; nothing is wired up. |

---

## 1. Stack at a glance

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js 16 (App Router, `proxy.ts`) + React 19 + TypeScript, mobile-first PWA | One codebase for web + installable mobile app; camera access via `getUserMedia`/`<input capture>` needs no native app |
| Styling/UI | Tailwind CSS 4 (hand-built components; shadcn/ui was planned but not used) | Fast to build a clean mobile UI solo; no design system to maintain from scratch |
| Backend | Next.js Route Handlers (Node runtime) | No separate backend service for a lean v1; colocated with frontend |
| Database | Supabase Postgres + `pgvector` | Managed Postgres, built-in Auth, Storage, and RLS — matches the vector-matching requirement natively |
| Auth & multi-tenancy | Supabase Auth + Postgres Row-Level Security | Confirmed direction — tenant isolation enforced at the database layer, not just in application code |
| File storage | Supabase Storage (private bucket, org-scoped paths) | Invoice photos/PDFs need to live somewhere; keeps everything in one platform |
| Vision extraction (OCR → structured JSON) | Planned: **Gemini 2.5 Flash** (primary), abstracted behind a provider interface. **Built: Claude (`claude-opus-5-5`, structured outputs); Gemini is a stub** | See §2 — honest comparison |
| Embeddings (semantic matching) | Voyage AI (`voyage-3.5` or `voyage-3-lite`) | Anthropic's recommended embedding partner; strong retrieval quality, cheap, dedicated embedding model (Claude/Gemini don't ship first-party embedding endpoints as good as a dedicated model) |
| Suggestion narrative | Claude (built: `claude-opus-5-5`; item-name expansion uses `claude-haiku-4-5`) | Reasoning over already-structured margin data — its actual strength, see §2 and §8 |
| External market data | USDA MyMarketNews API (free, US wholesale prices) + FAO Food Price Index (free, monthly, global) | See §7 |
| State/data fetching | Planned: TanStack Query. **Built: Server Components + Server Actions + `fetch` to route handlers; no client cache library** | Fewer moving parts for a solo-maintained app |
| Validation | Zod, shared between client and server | Single source of truth for request/response shapes |
| Hosting | Vercel (app + cron) + Supabase (data/storage/auth) | Zero-ops for a solo founder; both scale down to ~$0 at low volume |

---

## 2. Honest vendor decision: which AI actually does the vision extraction

> **Built:** the plan below recommended Gemini for extraction. In practice the Claude provider was implemented first, tested against real photographed invoices, and is what DoughTally runs today. The Gemini provider exists only as a stub (§5.1). The reasoning is kept here because it explains the provider interface and where a Gemini implementation would slot in.

This is the reasoning behind the choice, shown in full.

**The real input to this system is not a clean PDF — it's a phone photo of a crumpled paper invoice or a distributor's printed packing slip, taken by someone in a walk-in fridge.** That reframes the comparison: the number that matters is accuracy on *photographed/scanned* documents, not accuracy on born-digital PDFs (where every frontier model is >95% and the differences don't matter).

What the current data says (Sept 2026):

- **On scanned/photographed documents specifically**, Gemini's native multimodal OCR consistently benchmarks highest (~94%) because Google trained it with heavy in-house OCR data and it processes the image directly, without a separate OCR pre-pass. GPT and Claude both benchmark a few points lower on this specific category (~90–91%), historically because they've leaned more on the model reasoning over already-OCR'd text than on raw pixel-level recognition — though this gap has been narrowing each model generation.
- **On cost**, this is not close. Gemini 2.0/2.5 Flash-tier models run around **$0.0001–$0.0003 per page**. Claude Sonnet-tier models run **$0.005–$0.006 per page** — roughly 20–40x more per scan. At this app's actual volume (a small bakery scanning maybe 20–100 invoices a month), that's still fractions of a cent either way and won't move your unit economics. It matters more if you ever process invoices in bulk on someone's behalf, or if a "power user" caterer scans hundreds a month.
- **On structured-output reliability**, Claude currently has the strongest guarantee: its `structured-outputs` API (`output_config.format: json_schema`) does grammar-constrained sampling, so the response is *guaranteed* to be valid JSON matching your schema — not just "usually valid with a retry loop." GPT's JSON mode is close but shows more occasional malformed output at volume. Gemini's structured output is reliable but has, historically, needed a bit more defensive parsing than Claude's.

**Recommendation:** build the vision extraction step against a **provider-agnostic interface** (§5.1), with **Gemini 2.5 Flash as the default model for the extraction call itself** — because the accuracy that matters here is specifically "read a messy photographed invoice correctly," and Gemini wins that at a fraction of the cost. Keep Claude in the stack for the pieces where its strengths actually apply: structured-output guarantees for anything you want zero-parse-error reliability on, and reasoning over already-extracted data — which is exactly what the suggestion engine in §8 needs (turning "this menu item's margin dropped from 34% to 21%" into a clear, specific recommendation is a reasoning task, not a vision task).

If you'd rather run one vendor end-to-end for simplicity, Claude is the defensible second choice — the JSON reliability is genuinely excellent and will save you retry-logic engineering time — you'll just pay more per scan and should expect slightly more manual corrections on rough photos, which your swipe-to-verify flow already exists to catch anyway.

Either way: **do not hand-roll a separate OCR step.** All three frontier vision models read the image directly; a legacy OCR engine (Tesseract, etc.) in front of them would only hurt accuracy on messy real-world photos.

---

## 3. Database schema & Supabase migrations

Design principles:
- Every tenant-scoped table carries an `org_id` and is protected by RLS — no table is trusted to filter by org in application code alone. The one exception is `commodity_price_series` (§3.10), which is shared public reference data, not tenant data.
- Ingredient **cost is never a stored, cached number that can drift** — `ingredients.current_unit_cost` is a maintained field for fast reads, but it is always derived from (and kept in sync by) `ingredient_price_history`, which is the source of truth. Recipe/menu margin math reads live from these tables (a SQL view, §3.9) rather than a cached "margin" column, so "automatically updating menu margins in real time whenever new receipts are scanned" is true by construction, not by a background job you have to remember to run.
- `vendor_ingredient_aliases` is what makes the semantic matching *feel* smart over time: once a human confirms that "ORG CHKN BRST 40# CS" from a given distributor means "Chicken Breast," that exact vendor phrase is remembered and short-circuits the vector search on every future invoice from that vendor.
- Every ingredient price change is treated as an **event** that cascades: it doesn't just update one row, it computes and records exactly which recipes and menu items were affected and by how much (§3.11) — that's what turns "an ingredient cost more" into "here's what to do about it" in §8.

### 3.1 — `001_extensions.sql`

```sql
create extension if not exists "uuid-ossp";
create extension if not exists vector;
create extension if not exists pg_trgm; -- trigram search, useful backup for fuzzy text matching
```

### 3.2 — `002_orgs_and_profiles.sql`

```sql
create table organizations (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  business_type text, -- 'bakery' | 'food_truck' | 'caterer' | 'other', free text for v1
  subscription_tier text not null default 'trial', -- 'trial' | 'starter' | 'pro'
  stripe_customer_id text,
  price_alert_threshold_pct numeric(5,2) not null default 8.00, -- org-configurable sensitivity for ingredient price alerts
  max_unreviewed_line_items integer not null default 15, -- see §6.3 hard review gate
  target_margin_pct numeric(5,2) not null default 65.00, -- default target used by the suggestion engine, §8
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- one row per auth user, links them to an org
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  full_name text,
  role text not null default 'owner', -- 'owner' | 'staff' — future multi-user support
  created_at timestamptz not null default now()
);

create index profiles_org_id_idx on profiles(org_id);

-- helper used by every RLS policy below; security definer so it can read
-- profiles without recursing into the RLS policy on profiles itself
create or replace function current_org_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select org_id from profiles where id = auth.uid()
$$;
```

### 3.3 — `003_vendors_and_ingredients.sql`

```sql
create table vendors (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  normalized_name text generated always as (lower(trim(name))) stored,
  created_at timestamptz not null default now(),
  unique (org_id, normalized_name)
);

-- the master ingredient list — the thing every invoice line item ultimately
-- resolves to
create table ingredients (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  category text, -- 'produce' | 'protein' | 'dairy' | 'dry_goods' | 'packaging' | ...
  base_unit text not null, -- canonical unit this ingredient is costed in, e.g. 'g', 'ml', 'each'
  current_unit_cost numeric(12,4), -- denormalized for fast reads; source of truth is ingredient_price_history
  current_unit_cost_updated_at timestamptz,
  commodity_code text, -- nullable link into commodity_price_series for the market-watch panel, see §3.10/§7
  embedding vector(1024), -- voyage-3.5 embedding of the canonical name (+ synonyms)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ingredients_org_id_idx on ingredients(org_id);
-- HNSW index for fast approximate cosine similarity search, scoped per org
-- via a partial-index-friendly query pattern (filter org_id first in the query planner)
create index ingredients_embedding_hnsw_idx on ingredients
  using hnsw (embedding vector_cosine_ops);

create table ingredient_price_history (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references organizations(id) on delete cascade,
  ingredient_id uuid not null references ingredients(id) on delete cascade,
  vendor_id uuid references vendors(id),
  invoice_id uuid references invoices(id), -- fk added after invoices table exists, see 004
  unit_cost numeric(12,4) not null,
  unit text not null,
  quantity numeric(12,4), -- quantity on this line, for context/audit
  effective_date date not null default current_date,
  source text not null default 'invoice_scan', -- 'invoice_scan' | 'manual'
  created_at timestamptz not null default now()
);

create index ingredient_price_history_ingredient_idx
  on ingredient_price_history(ingredient_id, effective_date desc);
```

> Note: `ingredient_price_history` references `invoices(id)`, which is defined next — see the deferred FK added in `004_invoices_and_line_items.sql` below, or simply run 003 and 004 in the same transaction/migration if your tool doesn't support forward references.

### 3.4 — `004_invoices_and_line_items.sql`

```sql
create table invoices (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references organizations(id) on delete cascade,
  vendor_id uuid references vendors(id),
  uploaded_by uuid references profiles(id),
  file_storage_path text not null, -- path in the Supabase Storage bucket
  file_type text not null default 'image', -- 'image' | 'pdf'
  source_type text not null default 'camera_scan',
    -- 'camera_scan' | 'bulk_upload' | 'manual_entry' — see §9.1
  status text not null default 'pending',
    -- 'pending' | 'processing' | 'needs_review' | 'completed' | 'failed'
    -- 'failed' = vision extraction could not parse the file at all; the invoice
    -- routes straight to the manual-entry grid (§9.2) instead of the swipe UI.
    -- An invoice may ONLY reach 'completed' when it has zero line items in
    -- ('pending', 'needs_review', 'new_ingredient') — see §6.3.
  raw_extraction jsonb, -- full raw JSON returned by the vision model, for audit/debugging
  invoice_number text,
  invoice_date date,
  total_amount numeric(12,2),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index invoices_org_id_idx on invoices(org_id, created_at desc);
create index invoices_status_idx on invoices(org_id, status);

alter table ingredient_price_history
  add constraint ingredient_price_history_invoice_fk
  foreign key (invoice_id) references invoices(id) on delete set null;

create table invoice_line_items (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references organizations(id) on delete cascade,
  invoice_id uuid not null references invoices(id) on delete cascade,
  raw_text text not null, -- exactly what the vision model read, e.g. "ORG CHKN BRST 40# CS"
  parsed_quantity numeric(12,4),
  parsed_unit text,
  parsed_unit_cost numeric(12,4),
  parsed_line_total numeric(12,2),
  embedding vector(1024), -- embedding of raw_text, computed at extraction time
  matched_ingredient_id uuid references ingredients(id),
  match_confidence numeric(4,3), -- 0.000–1.000 cosine similarity of the chosen match
  match_status text not null default 'pending',
    -- 'pending' | 'auto_matched' | 'needs_review' | 'confirmed' | 'rejected' | 'new_ingredient'
  candidate_matches jsonb, -- top-N {ingredient_id, name, similarity} shown in swipe-to-verify
  entry_method text not null default 'vision', -- 'vision' | 'manual' — see §9.2
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index invoice_line_items_invoice_idx on invoice_line_items(invoice_id);
create index invoice_line_items_org_status_idx
  on invoice_line_items(org_id, match_status);
create index invoice_line_items_embedding_hnsw_idx on invoice_line_items
  using hnsw (embedding vector_cosine_ops);
```

### 3.5 — `005_vendor_ingredient_aliases.sql`

```sql
-- once a human confirms "ORG CHKN BRST 40# CS" -> Chicken Breast for a vendor,
-- every future invoice from that vendor with that exact (normalized) text
-- auto-matches with confidence 1.0, no vector search needed
create table vendor_ingredient_aliases (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references organizations(id) on delete cascade,
  vendor_id uuid references vendors(id),
  raw_text_normalized text not null, -- lower/trim/whitespace-collapsed raw_text
  ingredient_id uuid not null references ingredients(id) on delete cascade,
  confirmed_by uuid references profiles(id),
  times_used integer not null default 1,
  created_at timestamptz not null default now(),
  unique (org_id, vendor_id, raw_text_normalized)
);

create index vendor_aliases_lookup_idx
  on vendor_ingredient_aliases(org_id, vendor_id, raw_text_normalized);
```

### 3.6 — `006_recipes_and_menu.sql`

```sql
create table recipes (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  batch_yield_qty numeric(12,4) not null, -- e.g. 24
  batch_yield_unit text not null,          -- e.g. 'servings', 'cookies', 'liters'
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table recipe_ingredients (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references organizations(id) on delete cascade,
  recipe_id uuid not null references recipes(id) on delete cascade,
  ingredient_id uuid not null references ingredients(id),
  quantity numeric(12,4) not null,
  unit text not null, -- must be convertible to ingredients.base_unit, see §5.4
  created_at timestamptz not null default now()
);

create index recipe_ingredients_recipe_idx on recipe_ingredients(recipe_id);

create table menu_items (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references organizations(id) on delete cascade,
  recipe_id uuid references recipes(id),
  name text not null,
  selling_price numeric(12,2) not null,
  servings_per_batch numeric(12,4), -- how many menu-item servings one recipe batch yields, if different from batch_yield_qty
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index menu_items_org_idx on menu_items(org_id, is_active);
```

### 3.7 — `007_price_alerts.sql`

```sql
create table price_alerts (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references organizations(id) on delete cascade,
  ingredient_id uuid not null references ingredients(id) on delete cascade,
  invoice_id uuid references invoices(id),
  previous_unit_cost numeric(12,4) not null,
  new_unit_cost numeric(12,4) not null,
  pct_change numeric(6,2) not null, -- e.g. 12.50 meaning +12.5%
  acknowledged boolean not null default false,
  created_at timestamptz not null default now()
);

create index price_alerts_org_unacked_idx
  on price_alerts(org_id, acknowledged, created_at desc);
```

### 3.8 — `008_rls_policies.sql`

Enable RLS on every tenant table and scope all four operations to `current_org_id()`. Pattern shown for `ingredients`; repeat identically for `vendors`, `invoices`, `invoice_line_items`, `ingredient_price_history`, `vendor_ingredient_aliases`, `recipes`, `recipe_ingredients`, `menu_items`, `price_alerts`, and (§3.11) `menu_item_margin_impacts`.

```sql
alter table ingredients enable row level security;

create policy "org members can read their ingredients"
  on ingredients for select
  using (org_id = current_org_id());

create policy "org members can insert their ingredients"
  on ingredients for insert
  with check (org_id = current_org_id());

create policy "org members can update their ingredients"
  on ingredients for update
  using (org_id = current_org_id())
  with check (org_id = current_org_id());

create policy "org members can delete their ingredients"
  on ingredients for delete
  using (org_id = current_org_id());
```

```sql
-- profiles is special: a user can only ever see/edit their own row
alter table profiles enable row level security;

create policy "users can read their own profile"
  on profiles for select
  using (id = auth.uid());

create policy "users can update their own profile"
  on profiles for update
  using (id = auth.uid());
```

```sql
-- organizations: a user can read the org they belong to, not create/delete
-- arbitrary orgs from the client (Built: org creation happens in the
-- security-definer handle_new_user trigger on auth.users, migration 012)
alter table organizations enable row level security;

create policy "org members can read their organization"
  on organizations for select
  using (id = current_org_id());

create policy "org members can update their organization settings"
  on organizations for update
  using (id = current_org_id())
  with check (id = current_org_id());
```

```sql
-- commodity_price_series (§3.10) is shared public reference data, not
-- tenant data: every authenticated user may read it, nobody writes to it
-- from the client (only the scheduled ingestion job, via the service role
-- key, which bypasses RLS entirely).
alter table commodity_price_series enable row level security;

create policy "any authenticated user can read commodity prices"
  on commodity_price_series for select
  to authenticated
  using (true);
```

All Storage access follows the same pattern: the invoice-files bucket is private, and a Storage RLS policy checks that the path's leading segment (the `org_id` folder) matches `current_org_id()`.

### 3.9 — `009_costing_views.sql`

This is the piece that makes margins "automatically update" without a recompute job: cost-per-serving and menu margin are **views**, not stored columns.

```sql
create or replace view recipe_costs as
select
  r.id as recipe_id,
  r.org_id,
  r.name,
  r.batch_yield_qty,
  r.batch_yield_unit,
  sum(ri.quantity * i.current_unit_cost) as batch_total_cost,
  sum(ri.quantity * i.current_unit_cost) / nullif(r.batch_yield_qty, 0) as cost_per_serving
from recipes r
join recipe_ingredients ri on ri.recipe_id = r.id
join ingredients i on i.id = ri.ingredient_id
group by r.id;

create or replace view menu_item_margins as
select
  m.id as menu_item_id,
  m.org_id,
  m.name,
  m.selling_price,
  rc.cost_per_serving,
  (m.selling_price - rc.cost_per_serving) as margin_amount,
  case when m.selling_price > 0
    then round(((m.selling_price - rc.cost_per_serving) / m.selling_price) * 100, 2)
    else null
  end as margin_pct
from menu_items m
left join recipe_costs rc on rc.recipe_id = m.recipe_id;
```

> **Built — correction:** the original plan claimed these views "inherit RLS from their underlying tables automatically". That is **not** true. A Postgres view runs with its *owner's* privileges unless it is created `WITH (security_invoker = true)`. Owned by `postgres`, the views bypassed RLS, so any signed-in user could read every org's recipe costs and margins through them. **Migration 021** recreates both views with `security_invoker = true`, and migration 023 changed `recipe_costs` so that a recipe with an unpriced ingredient has an unknown cost rather than a too-low one. Every new view must use `security_invoker = true`.

**Historical margin trend (for charts, not a table):** rather than adding a `margin_snapshots` table that has to be populated on a schedule and can drift, compute a menu item's margin-over-time series on demand in the application layer (`lib/costing/marginHistory.ts`): fetch the recipe's ingredients, pull each one's full `ingredient_price_history`, merge the timelines, and evaluate the `recipe_costs`/`menu_item_margins` formula at each date a price changed. This keeps the database lean and guarantees the chart is never stale, at the cost of a slightly more involved read — perfectly fine at this app's data volume (a handful of ingredients per recipe, a few dozen price changes a year).

### 3.10 — `010_commodity_prices.sql`

Shared, non-tenant reference data for the market-price early-warning panel (§7). Not scoped by `org_id` because a wheat price is a wheat price regardless of which bakery is looking at it.

```sql
create table commodity_price_series (
  id uuid primary key default uuid_generate_v4(),
  source text not null, -- 'usda_ams' | 'fao_fpi'
  commodity_code text not null, -- e.g. 'wheat', 'eggs_large_white', 'butter', 'fao_dairy_index'
  commodity_label text not null, -- human-readable, e.g. "Eggs, Large White (US wholesale)"
  region text not null default 'US', -- 'US' | 'global'
  period_date date not null,
  value numeric(14,4) not null,
  unit text not null, -- 'usd_per_dozen', 'usd_per_bushel', 'index_point', ...
  created_at timestamptz not null default now(),
  unique (source, commodity_code, period_date)
);

create index commodity_price_series_lookup_idx
  on commodity_price_series(commodity_code, period_date desc);
```

A small hand-maintained default map from `ingredients.category` to a starter `commodity_code` lives in application code (`lib/market/categoryDefaults.ts`), not the database — e.g. `dairy → fao_dairy_index`, `dry_goods → wheat`, `protein → eggs_large_white` (US) as a reasonable v1 default — and a user can override it per-ingredient by setting `ingredients.commodity_code` directly.

### 3.11 — `011_margin_impacts.sql`

This is what directly answers "compare the invoice price to the recipe and menu and tell me if margins moved": whenever an ingredient price changes enough to cross the org's alert threshold, this table records, per affected menu item, exactly what the margin was before and after — computed at the moment of the price change, not just inferred later from a view.

```sql
create table menu_item_margin_impacts (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references organizations(id) on delete cascade,
  price_alert_id uuid not null references price_alerts(id) on delete cascade,
  menu_item_id uuid not null references menu_items(id) on delete cascade,
  recipe_id uuid not null references recipes(id),
  previous_margin_pct numeric(6,2),
  new_margin_pct numeric(6,2),
  margin_pct_delta numeric(6,2), -- new - previous; negative = margin compression
  previous_margin_amount numeric(12,4),
  new_margin_amount numeric(12,4),
  resolution text, -- null | 'raised_price' | 'adjusted_recipe' | 'switched_vendor' | 'ignored'
  resolution_notes text,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index margin_impacts_org_idx on menu_item_margin_impacts(org_id, created_at desc);
create index margin_impacts_price_alert_idx on menu_item_margin_impacts(price_alert_id);
```

`resolution` is intentionally simple and optional to fill in — it's a feedback loop (do owners mostly raise prices or adjust recipes?), not a workflow gate.

### 3.12 — Migrations added during the build (012–024)

The plan stopped at 011. These were added while building; read the SQL for details.

| Migration | What it does |
|---|---|
| `012_handle_new_user_trigger.sql` | Creates the org + profile in the same transaction as the `auth.users` insert (security definer trigger). |
| `013_invoice_storage.sql` | Private `invoices` Storage bucket; select/insert/update/delete policies on `{org_id}/…` paths. |
| `014_menu_item_servings_per_batch.sql` | Margin view honours `menu_items.servings_per_batch`. |
| `015_matching.sql` | `match_ingredients()` vector search (security invoker) and the `enforce_invoice_review_gate` trigger (§6.3). |
| `016_line_item_item_name.sql` | Plain-English `item_name` per line, used for embeddings and shown on swipe cards. |
| `017_price_cascade.sql` | Pack-size parsing and `apply_line_item_price()`: history, current cost, alert and margin impacts in one transaction. |
| `018_alert_narrative.sql` | Caches the Claude narrative on the alert. |
| `019_historical_prices.sql` | Backdated invoices go into history only; they don't move current cost or raise alerts. |
| `020_line_item_position.sql` | Stable printed/typed line order. |
| `021_views_security_invoker.sql` | **Security fix:** costing views now respect RLS (see §3.9). |
| `022_alias_not_ingredient.sql` | Remember "not an ingredient" per vendor phrase. |
| `023_recipe_costs_require_prices.sql` | A recipe's cost is unknown while any ingredient is unpriced. |
| `024_unique_ingredient_names.sql` | One ingredient per (case/space-insensitive) name per org. |

---

## 4. API endpoint design (Next.js Route Handlers)

All routes live under `app/api/**/route.ts`, run on the **Node runtime** (not Edge — image/PDF handling and the vision-model calls need it), and are protected by Supabase session middleware. Every handler still trusts RLS as the real security boundary; the handler-level org check is a defense-in-depth / better-error-message layer, not the only guard.

| Method & path | Purpose |
|---|---|
| `POST /api/invoices` | Create an invoice record after the file is uploaded to Storage; body: `{ file_storage_path, file_type, vendor_id? }`. Returns `{ invoice_id }`, status `pending`. |
| `POST /api/invoices/bulk` | Create many invoice records at once from a multi-file drag-and-drop backfill (§9.1); body: array of `{ file_storage_path, file_type }`. Returns `{ invoice_ids: [] }`; client (or a fire-and-forget loop server-side) then triggers `/scan` on each. |
| `POST /api/invoices/[id]/scan` | Kick off the vision extraction pipeline for that invoice (§5). Synchronous for v1 (a few seconds); returns the created line items with their match statuses. On total extraction failure, sets `status: failed` instead of throwing, so the invoice routes to manual entry (§9.2) rather than disappearing into an error. |
| `GET /api/invoices` | List invoices for the org, paginated, filterable by `status`. |
| `GET /api/invoices/[id]` | Invoice detail + its line items + match candidates. |
| `PATCH /api/invoices/[id]` | Edit invoice-level fields (vendor, date, invoice number) after review. |
| `DELETE /api/invoices/[id]` | Remove an invoice (e.g., accidental duplicate scan). |
| `GET /api/invoices/[id]/line-items` | Just the line items (used to poll/refresh the swipe-to-verify queue). |
| `POST /api/invoices/[id]/line-items` | Manually add a line item to an invoice (used for `failed`-status invoices and to supplement a scan that missed something). Runs the normal alias/vector matching on the entered text, same as a scanned line. |
| `PATCH /api/line-items/[id]` | Manually correct any parsed field (qty, unit, unit cost, matched ingredient) — the spreadsheet-style fallback edit, §9.2. |
| `POST /api/line-items/[id]/confirm` | Swipe-right: confirm the top (or a chosen) candidate match. Body: `{ ingredient_id }`. Writes/updates `vendor_ingredient_aliases`, inserts `ingredient_price_history`, updates `ingredients.current_unit_cost`, evaluates and creates a `price_alerts` row (+ cascading `menu_item_margin_impacts` rows, §6) if the delta exceeds the org's threshold. |
| `POST /api/line-items/[id]/reject` | Swipe-left: reject the suggested match; advances to the next candidate or flags `new_ingredient`. |
| `POST /api/line-items/[id]/create-ingredient` | Turn an unmatched line item into a brand-new master ingredient in one step. |
| `GET /api/ingredients` | List the master ingredient list, paginated/searchable. |
| `POST /api/ingredients` | Manually add an ingredient (embedding generated server-side on insert). |
| `PATCH /api/ingredients/[id]` | Edit name/category/base_unit/commodity_code; re-embeds if the name changes. |
| `GET /api/ingredients/[id]/price-history` | Price history series for a chart. |
| `GET /api/ingredients/[id]/market-context` | The commodity trend tied to this ingredient's `commodity_code`, for the ingredient detail page (§7). |
| `POST /api/ingredients/import` | CSV bulk upsert — the "software is bugging, let me just fix it in a spreadsheet" escape hatch (§9.2). |
| `GET /api/ingredients/export` | CSV download of the full master ingredient list + current costs. |
| `GET /api/recipes` / `POST /api/recipes` | List / create recipes. |
| `POST /api/onboarding/import-menu` | Runs `VisionProvider.extractMenu()` on an uploaded photo/PDF (§9.3); returns draft `{ name_guess, price_guess }` rows for the review screen, nothing written yet. |
| `POST /api/onboarding/import-recipe` | Runs `VisionProvider.extractRecipe()` on an uploaded photo/PDF (§9.3); returns draft recipe + ingredient lines (each already run through alias/vector matching) for the review screen, nothing written yet. |
| `GET /api/recipes/[id]` / `PATCH` / `DELETE` | Recipe detail (with ingredients) and edits. |
| `GET /api/recipes/[id]/cost` | Reads from the `recipe_costs` view — live cost-per-serving. |
| `GET /api/menu-items` / `POST` | List / create menu items. |
| `PATCH /api/menu-items/[id]` / `DELETE` | Edit price, active state, linked recipe. |
| `GET /api/menu-items/[id]/margin` | Reads from `menu_item_margins` view. |
| `GET /api/menu-items/[id]/margin-history` | Computed trend series over time (§3.9), for the sparkline/chart. |
| `GET /api/alerts` | Unacknowledged (and historical) price alerts for the org, each including its nested `menu_item_margin_impacts`. |
| `POST /api/alerts/[id]/ack` | Mark an alert acknowledged. |
| `GET /api/alerts/[id]/suggestions` | Deterministic + optional Claude-generated suggestions for the menu items affected by this alert (§8). |
| `POST /api/margin-impacts/[id]/resolve` | Record what the owner actually did about a margin drop (`raised_price` \| `adjusted_recipe` \| `switched_vendor` \| `ignored`) — feedback loop, not a gate. |
| `GET /api/market-trends` | Latest value + % change over a configurable window for every tracked commodity, plus which of the org's ingredients/categories are exposed to each (§7). |
| `POST /api/webhooks/stripe` | Billing webhook (subscription tier changes) — stubbed for v1, wired up when billing is added. |

Everything is validated against a shared Zod schema in `lib/validators/`, imported by both the route handler (server-side validation) and the client (form/mutation validation), so the shape is defined once.

> **Built:** the route handlers that exist today are:
>
> | Route | Notes |
> |---|---|
> | `GET/POST /api/invoices`, `POST /api/invoices/bulk` | as planned |
> | `PATCH/DELETE /api/invoices/[id]` | no `GET` (the invoice page loads it directly); `DELETE` only for invoices with **no** line items (409 otherwise), and it removes the file too |
> | `POST /api/invoices/[id]/scan`, `POST /api/invoices/[id]/line-items` | as planned (no `GET` for line items) |
> | `PATCH /api/line-items/[id]`, `POST …/confirm`, `…/reject`, `…/create-ingredient` | as planned |
> | `POST /api/line-items/[id]/not-ingredient` | **added**: remember a vendor phrase as "not an ingredient" (migration 022) |
> | `GET/POST /api/ingredients`, `PATCH/DELETE /api/ingredients/[id]`, `POST …/import`, `GET …/export` | as planned |
> | `GET/POST /api/recipes`, `GET/PATCH/DELETE /api/recipes/[id]`, `GET /api/recipes/[id]/cost` | as planned |
> | `GET/POST /api/menu-items`, `PATCH/DELETE /api/menu-items/[id]`, `GET /api/menu-items/[id]/margin` | as planned |
> | `POST /api/alerts/[id]/acknowledge` | planned as `/ack` |
> | `GET /api/alerts/[id]/suggestions` | as planned |
> | `POST /api/alerts/[id]/narrative` | **added**: the optional Claude narrative, generated once and cached on the alert (migration 018) |
> | `POST /api/onboarding/import-menu`, `…/import-recipe` | as planned |
> | `POST /api/onboarding/link-menu` | **added**: links imported menu items to recipes |
> | `GET /api/cron/ingest-market-data` | as planned; requires `Authorization: Bearer $CRON_SECRET` |
> | `GET /auth/confirm` | **added**: email-confirmation / magic-link landing |
>
> **Not built as routes** (data is loaded directly in Server Components instead): `GET /api/invoices/[id]`, `GET /api/invoices/[id]/line-items`, `GET /api/alerts`, `GET /api/ingredients/[id]/price-history`, `GET /api/ingredients/[id]/market-context`, `GET /api/menu-items/[id]/margin-history`, `GET /api/market-trends`. **Not built at all:** `POST /api/margin-impacts/[id]/resolve` and `POST /api/webhooks/stripe`.

---

## 5. AI vision + semantic matching pipeline

### 5.1 Provider abstraction

```ts
// lib/ai/vision/types.ts
export interface ExtractedLineItem {
  raw_text: string;
  quantity: number | null;
  unit: string | null;
  unit_cost: number | null;
  line_total: number | null;
}

export interface VisionExtractionResult {
  vendor_name_guess: string | null;
  invoice_date_guess: string | null; // ISO date
  invoice_number_guess: string | null;
  line_items: ExtractedLineItem[];
}

export interface VisionProvider {
  extractInvoice(fileBuffer: Buffer, mimeType: string): Promise<VisionExtractionResult>;
}
```

`mimeType` deliberately includes `application/pdf` alongside `image/jpeg`/`image/png` — both Gemini and Claude accept PDFs natively as a vision input (each page treated as an image internally), so backfilling historical invoices that arrive as emailed PDFs (§9.1) needs no separate PDF-to-image conversion step. A multi-page PDF is treated as one invoice for v1: all line items across all pages merge into a single `invoices` row's line items, which is the common case (one invoice, one PDF, possibly several pages of line items).

`lib/ai/vision/gemini.ts` implements this against Gemini 2.5 Flash with a forced JSON response schema; `lib/ai/vision/claude.ts` implements the same interface against Claude's `structured-outputs` API. The active provider is chosen by an env var (`VISION_PROVIDER=gemini|claude`), so switching — or later running both and reconciling — is a one-line config change, not a rewrite. The same `VisionProvider` interface is extended with `extractMenu()` and `extractRecipe()` methods for onboarding import (§9.3) — one abstraction, three extraction targets.

> **Built:** only `claude.ts` makes real calls. `gemini.ts` returns an empty result for all three methods, so with `VISION_PROVIDER=gemini` every scan ends up with no lines and goes to manual entry. **`VISION_PROVIDER` defaults to `gemini` when unset** (`lib/ai/vision/index.ts`): set `VISION_PROVIDER=claude` in every deployment until a real Gemini provider lands. A contribution implementing `GeminiVisionProvider` against the §5.3 schema is welcome.

### 5.2 End-to-end flow

1. **Client-side capture & compression** — user taps "Scan Invoice," camera opens via `<input type="file" accept="image/*" capture="environment">` (works everywhere, no permissions prompt beyond the OS camera picker) or `getUserMedia` for an in-app live preview if you want that polish later. The captured image is immediately downscaled client-side (canvas resize to ~1600px longest edge, JPEG re-encode at ~0.7 quality via a small compression utility) **before** upload — this is what "optimizes token usage," since vision-model cost and latency scale with image size/tokens, and a phone photo straight off the camera is often 3-4x larger than any of these models need to read text accurately. (PDFs from the bulk-import flow, §9.1, skip compression — they're already text-dense and small.)
2. **Upload** — compressed file goes to Supabase Storage at `invoices/{org_id}/{invoice_id}.{ext}`.
3. **`POST /api/invoices`** creates the row (`status: pending`).
4. **`POST /api/invoices/[id]/scan`**:
   - fetches the file from Storage,
   - calls the active `VisionProvider.extractInvoice()`,
   - stores the raw result in `invoices.raw_extraction`, sets `status: processing`,
   - for each returned line item: normalizes `raw_text` (lowercase, collapse whitespace), inserts an `invoice_line_items` row, computes its embedding via Voyage, and stores it.
   - if the provider call throws or returns zero line items for a non-empty file, sets `status: failed` instead of leaving the invoice stuck at `pending` — this is the trigger for the manual-entry path in §9.2.
5. **Matching, per line item, in order:**
   a. **Exact alias check** — look up `vendor_ingredient_aliases` for `(org_id, vendor_id, raw_text_normalized)`. Hit → `match_status = 'auto_matched'`, `match_confidence = 1.0`, done. This is the fast path and, after the first few invoices from a given vendor, should cover most lines.
   b. **Vector search** — if no alias hit, run a cosine-similarity search of the line item's embedding against `ingredients.embedding` scoped to `org_id`, take the top 3.
   c. **Confidence routing:** top similarity ≥ **0.90** → `auto_matched`; between **0.75 and 0.90** → `needs_review` with the top 3 candidates stored in `candidate_matches` for the swipe UI; below **0.75** → `match_status = 'new_ingredient'`, surfaced as "we didn't recognize this — add it?" rather than a bad guess. (These thresholds are a starting point — tune them against real usage; expose them as an org-level setting eventually.)
6. **`status: needs_review`** on the invoice if any line item needs review; otherwise `completed`. See §6.3 for the hard rule that keeps this from being ignorable.
7. **Swipe-to-verify UI** shows one card per `needs_review` (and `new_ingredient`) line item: raw text, parsed qty/cost, and the top candidate's name. Swipe right (or tap confirm) → `POST /api/line-items/[id]/confirm`; swipe left → next candidate or "create new ingredient."
8. **On confirm:** upsert the `vendor_ingredient_aliases` row (so this exact vendor phrasing never needs review again), insert `ingredient_price_history`, update `ingredients.current_unit_cost` + timestamp, and compare against the prior price: if `pct_change` exceeds the org's `price_alert_threshold_pct`, insert a `price_alerts` row **and then walk every recipe that uses this ingredient → every menu item that uses that recipe, computing before/after margin with the old vs. new unit cost, and insert one `menu_item_margin_impacts` row per affected menu item** (§6).
9. Because `recipe_costs` and `menu_item_margins` are views over `ingredients.current_unit_cost`, every confirmed price change is reflected the instant the next `GET /api/recipes/[id]/cost` or `/menu-items/[id]/margin` call happens — no cache to invalidate. The `menu_item_margin_impacts` row from step 8 is the durable record of "this is what changed and why," which the alerts feed and suggestion engine (§8) read from.

### 5.3 Structured extraction schema (the contract given to the vision model)

```json
{
  "type": "object",
  "properties": {
    "vendor_name_guess": { "type": ["string", "null"] },
    "invoice_date_guess": { "type": ["string", "null"], "description": "ISO 8601 date" },
    "invoice_number_guess": { "type": ["string", "null"] },
    "line_items": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "raw_text": { "type": "string", "description": "The item description exactly as printed" },
          "quantity": { "type": ["number", "null"] },
          "unit": { "type": ["string", "null"] },
          "unit_cost": { "type": ["number", "null"] },
          "line_total": { "type": ["number", "null"] }
        },
        "required": ["raw_text"]
      }
    }
  },
  "required": ["line_items"]
}
```

### 5.4 Unit conversion note

`ingredients.base_unit` and `recipe_ingredients.unit` won't always match what the invoice says (invoice: "case of 40lb," recipe: "grams per cookie"). v1 should ship a small fixed conversion table for common kitchen units (mass: g/kg/oz/lb; volume: ml/l/tsp/tbsp/cup/fl oz; count: each/dozen/case-of-N with a per-ingredient case size field) rather than trying to solve general unit conversion — this is a well-scoped utility module (`lib/costing/units.ts`), not an AI problem.

---

## 6. Margin-change detection & alerting

This is the piece that directly answers "track invoice prices, compare them to the recipe and the menu, and tell me if margins went up or down" — it's not a separate feature bolted on top of pricing, it's a cascade that fires automatically off the same event that already updates `ingredients.current_unit_cost`.

### 6.1 The cascade, concretely

When a line item is confirmed (§5.2 step 8) and the price move crosses the org's threshold:

1. A `price_alerts` row is created for the ingredient — the fact that a real, confirmed price change happened.
2. The system finds every `recipe_ingredients` row using that ingredient, then every `menu_items` row pointing at each of those recipes.
3. For each affected menu item, it computes `margin_pct` twice — once with the ingredient's previous unit cost, once with the new one, using the exact same formula as the `menu_item_margins` view — and writes one `menu_item_margin_impacts` row with both numbers and the delta.
4. The UI (§10) surfaces this as, concretely: *"Chicken Breast went from $2.10/lb to $2.35/lb (+12%). This affects 3 menu items: Chicken Sandwich margin drops 34% → 29%, Chicken Caesar Wrap 41% → 37%, Family Platter 22% → 17%."* That's a materially more useful notification than "an ingredient got more expensive," and it's what makes the suggestion engine (§8) possible — it already knows exactly which menu items need attention and by how much.

### 6.2 Why this is an event-log table and not just a view

`recipe_costs`/`menu_item_margins` (§3.9) always tell you the *current* margin — they can't tell you what it *was* five minutes ago, because `ingredients.current_unit_cost` has already moved on. `menu_item_margin_impacts` captures the before/after at the moment of change, which is the only way to say "margin dropped" rather than just "margin is now X."

### 6.3 The hard review gate

Two rules enforce that unresolved matches don't quietly rot in a queue, which is the real failure mode of a system like this (people scan and scan and never verify, and the cost data becomes fiction):

- An invoice can only reach `status: completed` when **zero** of its line items are in `pending`, `needs_review`, or `new_ingredient`. There's no path around this per-invoice.
- At the org level, if the count of line items sitting in `needs_review`/`new_ingredient`/`pending` across all invoices exceeds `organizations.max_unreviewed_line_items` (default 15), the app shows a full-screen "Action Required" interstitial on next open — not a dismissible toast — that goes straight to the swipe-to-verify queue and blocks scanning *new* invoices until the backlog is back under the cap. This is the literal "force the owner to go confirm items" behavior, scoped so it triggers on a real backlog rather than after every single scan (which would make the app annoying to use and get worked around).

---

## 7. Global/national commodity price early-warning panel

Full reasoning for this design is in the earlier discussion; the short version: raw commodity futures are too noisy and too disconnected from what one specific distributor charges one specific kitchen to drive a confident "price hike incoming" alert, so this is built as **directional context, not a prediction**, and it's kept structurally and visually separate from the price alerts in §6, which are facts about real invoices.

- **Data sources:** USDA MyMarketNews API (free, US wholesale/terminal market prices — eggs, dairy, meat cuts, produce — updated frequently and genuinely actionable for a US kitchen) as the primary source, and the FAO Food Price Index (free, monthly, five broad global categories: cereals, dairy, meat, sugar, vegetable oils) as coarser global/ambient context. If this product's market is not US-only, USDA coverage won't apply and FAO becomes primary — worth confirming before building the ingestion job.
- **Ingestion:** a scheduled job (Vercel Cron hitting a `route.ts` handler, or a Supabase Edge Function on a cron trigger) pulls new data on each source's own cadence and upserts into `commodity_price_series` using the service role key (bypassing RLS, since this is the one legitimate server-side writer).
- **Mapping:** `ingredients.commodity_code` links a specific ingredient to a tracked series, defaulted by category (`lib/market/categoryDefaults.ts`) and overridable per ingredient.
- **Presentation:** a "Market Watch" panel on the dashboard, not an alert — trend arrows and a plain-language line like *"Wheat is up 14% over 90 days — dry goods costs may follow"* with a muted, informational visual treatment (distinct color from the red/amber invoice-based alerts), computed on read as a simple % change over a configurable window (e.g. 90 days). No row is written anywhere for this — it's stateless and safe to get wrong occasionally, unlike a hard alert.
- **Deliberately not built in v1:** per-org dismiss/mute of individual commodity cards, and any attempt to translate a commodity move into a predicted dollar amount on a specific invoice — that crosses from "context" into "forecast," which is a claim this data can't actually support at this granularity.

---

## 8. Actionable suggestions when margins drop

Once §6 has computed exactly which menu items are affected and by how much, `GET /api/alerts/[id]/suggestions` turns that into concrete options — deterministic math first, an optional AI-written narrative on top.

**Deterministic suggestions (always available, no AI call needed):**
- **Raise price to restore target margin:** `new_price = new_cost_per_serving / (1 - target_margin_pct / 100)`, using `organizations.target_margin_pct` (or a per-menu-item override) — returned as "raise the Chicken Sandwich to $9.75 to get back to your 65% target."
- **Reduce cost via portion size:** back-solve the recipe quantity of the specific ingredient that moved, holding price fixed, to show "or reduce the chicken breast portion by 0.6 oz to hit the same target without changing the price."

**AI-generated narrative (optional, one Claude call per alert, not per menu item):** feed the structured before/after numbers from `menu_item_margin_impacts` plus the two deterministic options into Claude and ask for a short, specific paragraph weighing the tradeoff (e.g., noting that a 0.6oz portion cut on a sandwich is more noticeable to a customer than a $0.40 price increase). This is exactly the kind of reasoning-over-already-structured-data task Claude is strongest at (§2) — it's not extracting anything or inventing numbers, just explaining ones that are already computed and correct.

**Deliberately out of scope for v1:** an ingredient-substitution suggestion ("switch to a cheaper supplier/ingredient") is tempting but would require data the system doesn't have yet — multiple vendor prices for the same ingredient, or a real substitute-ingredient graph. Suggesting it without that data would be a guess dressed up as an insight, which is worse than not suggesting it. Revisit once `ingredient_price_history` has enough multi-vendor data to make it a real comparison rather than a hunch.

---

## 9. Bulk import, manual entry, and spreadsheet fallback

The AI pipeline (§5) is the happy path, not the only path — the app has to keep working, without any AI dependency, the moment a photo is too blurry, a vendor format is too weird, or the vision API itself is down.

### 9.1 Backfilling historical invoices

The camera-first `scan/page.tsx` flow (§10) is built for "just took a photo of today's delivery." Seeding the system with months of history is a different job, usually done at a desk, not on a phone: `app/(app)/invoices/import/page.tsx` is a drag-and-drop zone accepting multiple images and PDFs at once, calling `POST /api/invoices/bulk` to create all the invoice rows in one request, then processing (and reviewing) them as a queue rather than one at a time. This is also the natural place PDF support (§5.1) pays off, since old invoices are far more likely to be emailed PDFs than photos.

### 9.2 Manual entry and the spreadsheet-style grid

A single reusable component, `components/grid/EditableGrid.tsx` (tab-to-navigate, paste-a-block-of-cells, inline validation), backs three different screens rather than being a one-off:

- **Ingredient master list** — bulk-edit names, categories, units, costs directly, no dialog per field.
- **Invoice line items** — when an invoice's `status` is `failed` (vision couldn't read it at all) or a scan simply missed or mis-read a line, the owner types the row directly (`POST/PATCH` the line-item endpoints from §4); it still runs through the normal alias/vector matching, so a manually-typed line gets the same smart matching a scanned one would.
- **Recipe ingredients** — building or editing a recipe's ingredient list as rows, not one-at-a-time forms.

On top of the grid, `POST /api/ingredients/import` / `GET /api/ingredients/export` (CSV) is the literal "in case the software is bugging" escape hatch: at any point, the owner can pull their entire ingredient list into a real spreadsheet, edit it there, and push it back — the app never becomes the only way to see or fix this data.

### 9.3 Recipe & menu onboarding import

Manual entry (§9.2) is a fine *ongoing* way to add one recipe or menu item, but it is a bad *first* experience: a new signup with 20-30 existing recipes and a printed menu shouldn't have to type all of it into a grid before the app shows them anything useful. Almost every target user already has this material somewhere — a photographed recipe card, a notebook page, a Google Doc, a Canva menu PDF, a printed board — just not as structured data.

This reuses the vision pipeline built for invoices (§5) rather than adding a new one: same `VisionProvider` interface, same Storage upload path, same "AI does the first pass, a human confirms" shape — pointed at two new extraction targets instead of an invoice.

- **`VisionProvider.extractMenu()`** — given a photo or PDF of a menu, returns a flat list of `{ name_guess, price_guess }`. Maps to a lightweight review screen (not the swipe deck — this is a one-time onboarding list, not a recurring queue): an editable table pre-filled with the extraction, one row per detected item, before `POST /api/menu-items` is called per confirmed row.
- **`VisionProvider.extractRecipe()`** — given a photo or PDF of a recipe (card, notebook page, doc), returns `{ name_guess, yield_qty_guess, yield_unit_guess, ingredient_lines: [{ raw_text, quantity_guess, unit_guess }] }`. Each `raw_text` ingredient line runs through the **same alias/vector matching** as an invoice line item (§5.2 step 5) against the org's `ingredients` table — auto-matched, needs-review, or new-ingredient, same thresholds. This is the one place an onboarding import can fail softly: an ingredient that can't be matched just becomes a "create new ingredient?" prompt inline in the same review screen, exactly like the swipe-to-verify flow already teaches the user.
- **Confirmation writes:** a confirmed recipe row creates one `recipes` + N `recipe_ingredients` rows; a confirmed menu item creates one `menu_items` row, optionally linked to a recipe just created in the same session. No new tables are needed — this is a new *entry point* into the existing recipe/menu schema (§3.6), not a new schema.
- **Entry point:** `app/(app)/onboarding/import/page.tsx` — shown once, right after org creation, as a prompt: "Upload your menu and recipes to get started fast" (accepts multiple photos/PDFs at once, same drag-and-drop component as §9.1's invoice backfill) with a visible "Skip — I'll enter these manually" escape hatch straight to the existing recipe builder (`recipes/new/page.tsx`) and manual menu-item form. It is a suggestion at signup, not a gate: every screen it can create data on remains independently usable via manual entry at any time, and the same upload flow stays available later from `recipes/page.tsx` / `menu/page.tsx` (e.g. "Import from photo") for anyone who skips it initially or wants to add a new batch of recipes later.

---

## 10. Very visual, at-a-glance UI principles

This app's core value only lands if a margin problem is visible in one glance, not buried in a table — so a few things are treated as requirements, not polish:

- **Dashboard-first, not list-first.** The home screen is a grid of large menu-item cards, each with a color-coded margin badge (green ≥ target, amber within a few points, red below target or trending down) and a tiny sparkline of that item's margin trend — not a data table you have to interpret.
- **Color does the summarizing.** The same green/amber/red language is used consistently for margin health, price-alert severity, and review-queue backlog state, so the owner never has to read numbers to know if something needs attention.
- **Every price and margin number is paired with its trend**, not shown as a bare current value — a small sparkline or up/down arrow with the % change, using `/price-history` and `/margin-history` (§4).
- **The swipe-to-verify queue and the Action Required interstitial (§6.3) are the most visually prominent states in the app** when they're active — this is a deliberate choice given how much the rest of the system depends on matches actually getting confirmed.
- Component-level, this means `MarginHealthBadge.tsx`, `TrendSparkline.tsx`, and `MenuItemCard.tsx` are core shared components (added to §10's file tree below), used everywhere a cost or margin number appears, not just on one dashboard page.

---

## 11. Next.js TypeScript codebase structure

> **Built:** this is the actual layout. The original plan's tree differed mainly in naming: `middleware.ts` became `proxy.ts`; `lib/ai/suggestions/claude.ts` became `lib/suggestions/narrative.ts`; `lib/market/usdaAms.ts`/`faoFpi.ts` became `series.ts`/`ingest.ts`/`trends.ts`; there is no `lib/costing/marginImpact.ts` because the cascade is SQL; and there is no `types/domain.ts` or `supabase/seed.sql`.

```
proxy.ts                          # Next 16 "middleware": session refresh + route protection + access gate
app/
  layout.tsx  manifest.ts  globals.css
  offline/page.tsx                # PWA offline fallback
  auth/confirm/route.ts           # email confirmation / magic-link landing
  (marketing)/
    page.tsx                      # landing page
    login/  signup/  signup/check-email/
    privacy/  terms/  cookies/    # legal pages (contact in lib/legal.ts)
    auth-actions.ts               # sign up / log in / log out server actions
  (app)/                          # authenticated shell, mobile-first
    layout.tsx                    # sidebar / mobile nav + Action Required gate (§6.3)
    dashboard/page.tsx            # menu-item cards, margin health, market watch
    add/page.tsx                  # one entry point for any photo import
    invoices/
      page.tsx  scan/page.tsx  import/page.tsx
      [id]/page.tsx  [id]/review/page.tsx  [id]/manual-entry/page.tsx
    review/page.tsx               # org-wide swipe-to-verify queue
    ingredients/page.tsx          # grid + CSV import/export
    recipes/page.tsx  recipes/[id]/page.tsx
    menu/page.tsx
    margins/page.tsx              # margins by menu item and by ingredient
    alerts/page.tsx  alerts/[id]/page.tsx
    market/page.tsx               # commodity trend panel (§7)
    onboarding/import/page.tsx    # recipe/menu import (§9.3)
    settings/page.tsx  settings/actions.ts
    admin/page.tsx                # owner console (DOUGHTALLY_ADMIN_EMAILS); 404 for everyone else
  api/                            # see the "Built" route table in §4

components/
  alerts/ analytics/ app/ auth/ camera/ grid/ ingredients/ invoices/
  landing/ legal/ market/ marketing/ menu/ onboarding/ pwa/ recipes/
  review/ settings/ swipe/ ui/ visual/

lib/
  supabase/   server.ts browser.ts proxy.ts admin.ts (service role, server-only) user.ts org.ts columns.ts
  ai/         vision/{types,claude,gemini(stub),index}.ts  embeddings/voyage.ts  itemNames.ts
  matching/   vectorMatch.ts normalize.ts thresholds.ts vendors.ts queue.ts review.ts
  costing/    applyPrice.ts units.ts marginHistory.ts retryPrices.ts
  suggestions/ engine.ts math.ts narrative.ts
  market/     categoryDefaults.ts series.ts ingest.ts trends.ts
  onboarding/ paths.ts reason.ts upload.ts wrongKind.ts
  dashboard/  invoices/  ingredients/  dates/  media/  visual/  validators/
  access.ts (pre-launch gate)  admin/ (owner console)  csv.ts  legal.ts

types/database.ts                 # generated via `supabase gen types typescript`

supabase/
  config.toml                     # local Supabase CLI config
  migrations/001_extensions.sql … 024_unique_ingredient_names.sql

scripts/
  test-*.mjs                      # end-to-end checks against a real Supabase project
  fixtures/                       # made-up businesses and invoices
  seed-demo-data.mjs  make-*.mjs  screenshot-*.mjs  backfill-ingredient-embeddings.mjs

public/
  icons/                          # PWA icon set (192, 512, maskable)
  sw.js                           # service worker (offline shell + cache)
vercel.json                       # region + daily market-data cron
```

**Notes on a few structural decisions:**
- Route grouping `(app)` vs `(marketing)` keeps the authenticated, mobile-first shell (bottom nav, camera-first) completely separate from any public marketing/landing pages.
- The vision/embedding/suggestion provider modules are the only places that call third-party AI APIs — everything else in the app talks to Postgres and Storage. That keeps the AI vendor swap contained to a handful of files.
- `types/database.ts` should be generated, not hand-written (`supabase gen types typescript --project-id <id> > types/database.ts`), and regenerated whenever a migration changes the schema, so query results are typed against the real schema automatically.
- **Built:** the service-role client (`lib/supabase/admin.ts`) imports `server-only`, so importing it from a Client Component fails the build. Its only callers are the market-data cron job and the owner console's counts (after `isAdmin()`).

---

## 12. Deliberately out of scope for v1

Flagging these so they're a conscious choice, not an oversight: Stripe billing integration (schema has a `stripe_customer_id` placeholder, nothing wired up yet), offline-first scanning with background sync (v1 requires connectivity to scan), multi-user roles beyond owner/staff, push notifications for price alerts or market trends (in-app only for v1), general (non-kitchen) unit conversion, per-org dismiss/mute of individual market-watch commodity cards, translating a commodity move into a predicted dollar amount on a specific future invoice, and ingredient-substitution suggestions (needs multi-vendor price data this system doesn't have yet). All are natural v2 additions once the core loop — scan → match → cost → margin → suggestion — is validated with real users.

---

## 13. Suggested build order

> **Built:** steps 1–13 are complete, in roughly this order. Later work added the access gate, owner console, legal pages, analytics and performance work, plus migrations 012–024.

1. Supabase project + migrations 001–011, confirm RLS with two test orgs (verify org A truly cannot read org B's data).
2. Auth + org creation flow (signup creates an `organizations` row and a `profiles` row in one server action).
3. Manual ingredient CRUD + recipe builder + `recipe_costs`/`menu_item_margins` views — this proves the costing math end-to-end with hand-entered data, before any AI is involved.
4. The visual layer early, not last: `MarginHealthBadge`, `TrendSparkline`, `MenuItemCard`, and the dashboard grid, built against the manually-entered data from step 3 — validates the "very visual" requirement before AI complexity is layered on top.
5. Invoice upload + Storage wiring (single camera scan first), no AI yet — confirm the file pipeline works.
6. Vision provider integration (Gemini first) + line-item creation from `raw_extraction`.
7. Vector matching + confidence routing + swipe-to-verify UI + the hard review gate (§6.3).
8. Price history + price alerts + the margin-impact cascade (§6.1) — this is the point where "an ingredient got pricier" becomes "here's what it does to your menu."
9. The suggestion engine (§8) — deterministic first, Claude narrative second.
10. Bulk/PDF import (§9.1) and the manual-entry grid + CSV import/export (§9.2).
11. Commodity price ingestion job + Market Watch panel (§7) — last, because it's the most speculative feature and the least connected to daily invoice processing.
12. Recipe & menu onboarding import (§9.3) — `extractMenu()`/`extractRecipe()` on the existing `VisionProvider`, the onboarding upload screen, and the review-and-confirm flow. Placed before PWA polish because it reduces first-session friction for every new signup, while PWA polish only benefits an already-active user.
13. PWA polish (manifest, install prompt, icons).
