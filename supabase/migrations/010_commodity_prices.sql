set search_path to "$user", public, extensions;

-- Shared, non-tenant reference data for the market-price early-warning panel
-- (§7). Not scoped by org_id because a wheat price is a wheat price
-- regardless of which bakery is looking at it.

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

-- Every authenticated user may read it; nobody writes to it from the client
-- (only the scheduled ingestion job, via the service role key, which
-- bypasses RLS entirely).
alter table commodity_price_series enable row level security;

create policy "any authenticated user can read commodity prices"
  on commodity_price_series for select
  to authenticated
  using (true);
