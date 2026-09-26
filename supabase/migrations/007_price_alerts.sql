set search_path to "$user", public, extensions;

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
