# DoughLine — Technical Architecture & Implementation Plan

**Product:** Lean AI-powered back-office micro-SaaS for micro-food businesses (home bakeries, food trucks, small caterers) — protects margins by automating wholesale invoice processing and real-time cost/margin tracking.

**Purpose of this document:** a complete, opinionated implementation spec you can hand directly to a Claude Code session (or any engineer) to start scaffolding. It covers the stack decision, database schema + migrations, API surface, the AI vision/matching pipeline, margin-change alerting, the commodity-price early-warning panel, the suggestion engine, manual-entry fallbacks, and the Next.js codebase layout. No code has been scaffolded yet — this is the plan to build from.

---

## 1. Stack at a glance

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js 15 (App Router) + TypeScript, mobile-first PWA | One codebase for web + installable mobile app; camera access via `getUserMedia`/`<input capture>` needs no native app |
| Styling/UI | Tailwind CSS + shadcn/ui | Fast to build a clean mobile UI solo; no design system to maintain from scratch |
| Backend | Next.js Route Handlers (Node runtime) | No separate backend service for a lean v1; colocated with frontend |
| Database | Supabase Postgres + `pgvector` | Managed Postgres, built-in Auth, Storage, and RLS — matches the vector-matching requirement natively |
| Auth & multi-tenancy | Supabase Auth + Postgres Row-Level Security | Confirmed direction — tenant isolation enforced at the database layer, not just in application code |
| File storage | Supabase Storage (private bucket, org-scoped paths) | Invoice photos/PDFs need to live somewhere; keeps everything in one platform |
| Vision extraction (OCR → structured JSON) | **Gemini 2.5 Flash** (primary), abstracted behind a provider interface | See §2 — honest comparison |
| Embeddings (semantic matching) | Voyage AI (`voyage-3.5` or `voyage-3-lite`) | Anthropic's recommended embedding partner; strong retrieval quality, cheap, dedicated embedding model (Claude/Gemini don't ship first-party embedding endpoints as good as a dedicated model) |
| Suggestion narrative | Claude (Sonnet) | Reasoning over already-structured margin data — its actual strength, see §2 and §8 |
| External market data | USDA MyMarketNews API (free, US wholesale prices) + FAO Food Price Index (free, monthly, global) | See §7 |
| State/data fetching | TanStack Query | Standard, well-understood server-state caching for a solo-maintained app |
| Validation | Zod, shared between client and server | Single source of truth for request/response shapes |
| Hosting | Vercel (app + cron) + Supabase (data/storage/auth) | Zero-ops for a solo founder; both scale down to ~$0 at low volume |

---

## 2. Honest vendor decision: which AI actually does the vision extraction

You asked for the honest answer, not the convenient one, so here it is with the reasoning shown.

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
- `vendor_ingredient_aliases` is what makes the semantic matching *feel* smart over time: once a human confirms that "ORG CHKN BRST 40# CS" from Sysco means "Chicken Breast," that exact vendor phrase is remembered and short-circuits the vector search on every future invoice from that vendor.
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
-- once a human confirms "ORG CHKN BRST 40# CS" -> Chicken Breast for Sysco,
-- every future invoice from Sysco with that exact (normalized) text
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
-- arbitrary orgs from the client (org creation happens via a signup server
-- action using the service role)
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
  s.cost_per_serving,
  (m.selling_price - s.cost_per_serving) as margin_amount,
  case when m.selling_price > 0
    then round(((m.selling_price - s.cost_per_serving) / m.selling_price) * 100, 2)
    else null
  end as margin_pct
from menu_items m
left join recipe_costs rc on rc.recipe_id = m.recipe_id
cross join lateral (
  select rc.batch_total_cost
    / nullif(coalesce(m.servings_per_batch, rc.batch_yield_qty), 0) as cost_per_serving
) s;
```

A menu item's cost per serving is the recipe's batch cost divided by the menu item's own `servings_per_batch` when set (e.g. a 24-cookie recipe sold as 6-packs → 4), falling back to the recipe's `batch_yield_qty`. The margin cascade (§6.1), margin history, and suggestion math (§8) all use this same divisor. (The first cut in `009_costing_views.sql` ignored the override; `014_menu_item_servings_per_batch.sql` replaces the view with this version.)

These views inherit RLS from their underlying tables automatically (Postgres evaluates the RLS of the base tables), so no separate policy is needed on the views themselves as long as they're created with the querying role's normal permissions (not `security definer`).

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

`lib/ai/vision/gemini.ts` implements this against Gemini 2.5 Flash with a forced JSON response schema; `lib/ai/vision/claude.ts` implements the same interface against Claude's `structured-outputs` API. The active provider is chosen by an env var (`VISION_PROVIDER=gemini|claude`), so switching — or later running both and reconciling — is a one-line config change, not a rewrite.

### 5.2 End-to-end flow

1. **Client-side capture & compression** — user taps "Scan Invoice," camera opens via `<input type="file" accept="image/*" capture="environment">` (works everywhere, no permissions prompt beyond the OS camera picker) or `getUserMedia` for an in-app live preview if you want that polish later. The captured image is immediately downscaled client-side (canvas resize to ~1600px longest edge, JPEG re-encode at ~0.7 quality via a small compression utility) **before** upload — this is what "optimizes token usage," since vision-model cost and latency scale with image size/tokens, and a phone photo straight off the camera is often 3-4x larger than any of these models need to read text accurately. (PDFs from the bulk-import flow, §9.1, skip compression — they're already text-dense and small.)
2. **Upload** — compressed file goes to Supabase Storage at `invoices/{org_id}/{invoice_id}.{ext}`.
3. **`POST /api/invoices`** creates the row (`status: pending`).
4. **`POST /api/invoices/[id]/scan`**:
   - fetches the file from Storage,
   - calls the active `VisionProvider.extractInvoice()`,
   - stores the raw result in `invoices.raw_extraction`, sets `status: processing`,
   - for each returned line item: normalizes `raw_text` (lowercase, collapse whitespace), inserts an `invoice_line_items` row, computes its embedding via Voyage, and stores it. The embedding is of the line's **`item_name`** (the vision model's plain-English reading, e.g. "BUTTER SWT UNSLTD 36/1#" → "unsalted sweet butter", stored as `parsed_item_name`), not of the raw print — measured on real photographed invoices, raw distributor shorthand embedded too poorly to rank correctly or to separate "in the list" from "not in the list" at any threshold. `raw_text` stays verbatim as the alias key. Both lines and ingredient names use symmetric voyage-3.5 embeddings (no `input_type`); query/document mode compressed scores and document/document inflated them into wrong matches.
   - if the provider call throws or returns zero line items for a non-empty file, sets `status: failed` instead of leaving the invoice stuck at `pending` — this is the trigger for the manual-entry path in §9.2.
5. **Matching, per line item, in order:**
   a. **Exact alias check** — look up `vendor_ingredient_aliases` for `(org_id, vendor_id, raw_text_normalized)`. Hit → `match_status = 'auto_matched'`, `match_confidence = 1.0`, done. This is the fast path and, after the first few invoices from a given vendor, should cover most lines.
   b. **Vector search** — if no alias hit, run a cosine-similarity search of the line item's embedding against `ingredients.embedding` scoped to `org_id`, take the top 3.
   c. **Confidence routing:** top similarity ≥ **0.90** → `auto_matched`; between **0.75 and 0.90** → `needs_review`; below **0.75** → `match_status = 'new_ingredient'`. The top 3 candidates are stored in `candidate_matches` either way. **Display rule (swipe card only, never changes `match_status`):** candidates below **0.65** aren't shown at all — the card says "No match found" and offers create-new or a manual search of the ingredient list; a `new_ingredient` line whose top candidate is 0.65–0.75 shows it as a "low confidence" suggestion. First calibration on real data (8 photographed Sysco lines vs. a 15-ingredient bakery list): correct matches at 0.681–0.946, not-in-list items topping out at 0.603–0.606 — so the correct eggs match (0.681) routes to `new_ingredient` but is still suggested, and vanilla/cream show "No match found". Thresholds live in `lib/matching/thresholds.ts`. (Still a starting point on a small sample — keep tuning against real usage; expose as an org-level setting eventually.) The vector search (`match_ingredients()`, migration 015) is an exact per-org scan rather than an HNSW index scan: the shared index filters by org *after* choosing candidates, which can silently drop an org's rows once many orgs share it.
6. **`status: needs_review`** on the invoice if any line item needs review; otherwise `completed`. See §6.3 for the hard rule that keeps this from being ignorable. If matching itself fails (e.g. Voyage unreachable), the extracted lines are still saved as `pending` with no candidates, so they reach the review queue for a manual pick instead of being lost.
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
          "item_name": { "type": ["string", "null"], "description": "Plain-English generic product name, abbreviations expanded, no brand/pack size/code — what matching embeds" },
          "quantity": { "type": ["number", "null"] },
          "unit": { "type": ["string", "null"] },
          "unit_cost": { "type": ["number", "null"] },
          "line_total": { "type": ["number", "null"] },
          "pack_quantity": { "type": ["number", "null"], "description": "Total amount in ONE invoice unit, from the printed pack size: '36/1#' -> 36" },
          "pack_unit": { "type": ["string", "null"], "description": "Unit of pack_quantity: lb, oz, dozen, gal, qt, ..." }
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

As built (step 8): instead of a per-ingredient case-size field, the vision model reads the pack size off the printed description (`pack_quantity`/`pack_unit`, e.g. "BUTTER SWT UNSLTD 36/1#" → 36 lb), since case sizes vary by vendor and the print already states them. `toBaseUnitCost()` then converts the invoice price to the ingredient's `base_unit`: sold by weight/volume → that unit's factor; else pack size (preferred over a bare "EA", which on invoices usually means one case); else a bare count unit. When no safe conversion exists the price is **not** applied and the reason is stored on the line (`invoice_line_items.price_note`, shown on the invoice page) — never a silent guess. Recipe quantities are still assumed to be in the ingredient's base unit (the costing views ignore `recipe_ingredients.unit`).

---

## 6. Margin-change detection & alerting

This is the piece that directly answers "track invoice prices, compare them to the recipe and the menu, and tell me if margins went up or down" — it's not a separate feature bolted on top of pricing, it's a cascade that fires automatically off the same event that already updates `ingredients.current_unit_cost`.

### 6.1 The cascade, concretely

When a line item is matched — confirmed by a human, created as a new ingredient, or auto-matched at scan time (otherwise the alias fast path would stop prices updating after the first invoice) — its base-unit price is applied by `apply_line_item_price()` (migration 017) in one transaction: `ingredient_price_history` row, `ingredients.current_unit_cost` update, and, when `abs(pct_change)` exceeds `organizations.price_alert_threshold_pct` (drops count too — margins going *up* is also worth knowing), the steps below. It's idempotent per line (`price_applied_at`). A first-ever price (no previous cost) never alerts.

When the price move crosses the org's threshold:

1. A `price_alerts` row is created for the ingredient — the fact that a real, confirmed price change happened.
2. The system finds every `recipe_ingredients` row using that ingredient, then every `menu_items` row pointing at each of those recipes.
3. For each affected menu item, it computes `margin_pct` twice — once with the ingredient's previous unit cost, once with the new one, using the exact same formula as the `menu_item_margins` view — and writes one `menu_item_margin_impacts` row with both numbers and the delta. As built, it literally reads the view before and after moving the cost, inside the same transaction, so the formula can't drift. Only **active** menu items are included — a retired item's margin isn't actionable.
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

On top of the grid, `POST /api/ingredients/import` / `GET /api/ingredients/export` (CSV) is the literal "in case the software is bugging" escape hatch you asked for: at any point, the owner can pull their entire ingredient list into a real spreadsheet, edit it there, and push it back — the app never becomes the only way to see or fix this data.

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

```
app/
  (marketing)/
    page.tsx                      # landing page
  (app)/                          # authenticated shell, mobile-first
    layout.tsx                    # bottom-nav mobile layout + Action Required banner (§6.3)
    dashboard/page.tsx            # menu-item cards, margin health, market watch panel
    invoices/
      page.tsx                    # invoice list
      scan/page.tsx               # camera capture + upload flow
      import/page.tsx             # bulk drag-and-drop backfill (§9.1)
      [id]/page.tsx               # invoice detail
      [id]/review/page.tsx        # swipe-to-verify queue for this invoice
      [id]/manual-entry/page.tsx  # spreadsheet-style entry for `failed` invoices (§9.2)
    ingredients/
      page.tsx                    # includes bulk-edit grid + CSV import/export
      [id]/page.tsx               # price history chart + market context
    recipes/
      page.tsx
      new/page.tsx
      [id]/page.tsx               # recipe builder + live cost-per-serving
    menu/
      page.tsx                    # menu items + margins
    alerts/
      page.tsx                    # price alerts + margin impacts + suggestions
    market/
      page.tsx                    # commodity trend panel (§7)
    settings/
      page.tsx                    # thresholds, target margin, max_unreviewed_line_items
  api/
    invoices/route.ts
    invoices/bulk/route.ts
    invoices/[id]/route.ts
    invoices/[id]/scan/route.ts
    invoices/[id]/line-items/route.ts
    line-items/[id]/route.ts
    line-items/[id]/confirm/route.ts
    line-items/[id]/reject/route.ts
    line-items/[id]/create-ingredient/route.ts
    ingredients/route.ts
    ingredients/import/route.ts
    ingredients/export/route.ts
    ingredients/[id]/route.ts
    ingredients/[id]/price-history/route.ts
    ingredients/[id]/market-context/route.ts
    recipes/route.ts
    recipes/[id]/route.ts
    recipes/[id]/cost/route.ts
    menu-items/route.ts
    menu-items/[id]/route.ts
    menu-items/[id]/margin/route.ts
    menu-items/[id]/margin-history/route.ts
    alerts/route.ts
    alerts/[id]/ack/route.ts
    alerts/[id]/suggestions/route.ts
    margin-impacts/[id]/resolve/route.ts
    market-trends/route.ts
    cron/ingest-market-data/route.ts   # invoked by Vercel Cron
    webhooks/stripe/route.ts
  layout.tsx
  manifest.ts                     # PWA web app manifest (Next's built-in manifest route)
  globals.css

components/
  camera/
    CaptureButton.tsx
    ImageCompressor.ts             # canvas-based client-side resize/compress
  swipe/
    SwipeDeck.tsx
    SwipeCard.tsx
  grid/
    EditableGrid.tsx               # shared spreadsheet-style component, §9.2
  ingredients/
    IngredientPicker.tsx
  recipes/
    RecipeIngredientRow.tsx
    CostBreakdown.tsx
  visual/
    MarginHealthBadge.tsx          # green/amber/red, used everywhere a margin appears
    TrendSparkline.tsx
    MenuItemCard.tsx
  ui/                              # shadcn/ui primitives

lib/
  supabase/
    server.ts                     # server-side client (RLS-respecting, uses user session)
    browser.ts                    # browser client
    middleware.ts                 # session refresh helper used by middleware.ts
  ai/
    vision/
      types.ts
      gemini.ts
      claude.ts
      index.ts                    # provider selection by env var
    embeddings/
      voyage.ts
    suggestions/
      claude.ts                    # narrative suggestion generation, §8
  matching/
    vectorMatch.ts                 # pgvector query + confidence thresholds
    normalize.ts                   # raw_text normalization for alias lookups
  costing/
    units.ts                       # unit conversion table + helpers
    recipeCost.ts
    marginHistory.ts               # on-demand historical margin series, §3.9
    marginImpact.ts                # the cascade in §6.1
    suggestions.ts                 # deterministic price/portion suggestions, §8
  market/
    categoryDefaults.ts            # ingredient category -> commodity_code defaults
    usdaAms.ts                     # USDA MyMarketNews ingestion
    faoFpi.ts                      # FAO Food Price Index ingestion
  validators/
    invoice.ts
    ingredient.ts
    recipe.ts
    menuItem.ts

types/
  database.ts                     # generated via `supabase gen types typescript`
  domain.ts                       # hand-written domain types not derivable from the DB

supabase/
  migrations/
    001_extensions.sql
    002_orgs_and_profiles.sql
    003_vendors_and_ingredients.sql
    004_invoices_and_line_items.sql
    005_vendor_ingredient_aliases.sql
    006_recipes_and_menu.sql
    007_price_alerts.sql
    008_rls_policies.sql
    009_costing_views.sql
    010_commodity_prices.sql
    011_margin_impacts.sql
  seed.sql

middleware.ts                     # Supabase session refresh + route protection
public/
  icons/                          # PWA icon set (192, 512, maskable)
  sw.js                           # service worker (offline shell + cache)
```

**Notes on a few structural decisions:**
- Route grouping `(app)` vs `(marketing)` keeps the authenticated, mobile-first shell (bottom nav, camera-first) completely separate from any public marketing/landing pages.
- The vision/embedding/suggestion provider modules are the only places that call third-party AI APIs — everything else in the app talks to Postgres and Storage. That keeps the AI vendor swap contained to a handful of files.
- `types/database.ts` should be generated, not hand-written (`supabase gen types typescript --project-id <id> > types/database.ts`), and regenerated whenever a migration changes the schema, so query results are typed against the real schema automatically.

---

## 12. Deliberately out of scope for v1

Flagging these so they're a conscious choice, not an oversight: Stripe billing integration (schema has a `stripe_customer_id` placeholder, nothing wired up yet), offline-first scanning with background sync (v1 requires connectivity to scan), multi-user roles beyond owner/staff, push notifications for price alerts or market trends (in-app only for v1), general (non-kitchen) unit conversion, per-org dismiss/mute of individual market-watch commodity cards, translating a commodity move into a predicted dollar amount on a specific future invoice, and ingredient-substitution suggestions (needs multi-vendor price data this system doesn't have yet). All are natural v2 additions once the core loop — scan → match → cost → margin → suggestion — is validated with real users.

---

## 13. Suggested build order

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
12. PWA polish (manifest, install prompt, icons).
