set search_path to "$user", public, extensions;

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
