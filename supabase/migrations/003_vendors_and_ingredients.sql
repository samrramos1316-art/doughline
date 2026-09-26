set search_path to "$user", public, extensions;

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
  invoice_id uuid, -- fk added in 004_invoices_and_line_items.sql once invoices exists (forward reference)
  unit_cost numeric(12,4) not null,
  unit text not null,
  quantity numeric(12,4), -- quantity on this line, for context/audit
  effective_date date not null default current_date,
  source text not null default 'invoice_scan', -- 'invoice_scan' | 'manual'
  created_at timestamptz not null default now()
);

create index ingredient_price_history_ingredient_idx
  on ingredient_price_history(ingredient_id, effective_date desc);
