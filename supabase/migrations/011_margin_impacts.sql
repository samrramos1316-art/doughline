set search_path to "$user", public, extensions;

-- This is what directly answers "compare the invoice price to the recipe and
-- menu and tell me if margins moved": whenever an ingredient price changes
-- enough to cross the org's alert threshold, this table records, per
-- affected menu item, exactly what the margin was before and after —
-- computed at the moment of the price change, not just inferred later from
-- a view.

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

-- resolution is intentionally simple and optional to fill in — it's a
-- feedback loop (do owners mostly raise prices or adjust recipes?), not a
-- workflow gate.

alter table menu_item_margin_impacts enable row level security;

create policy "org members can read their menu item margin impacts"
  on menu_item_margin_impacts for select
  using (org_id = current_org_id());

create policy "org members can insert their menu item margin impacts"
  on menu_item_margin_impacts for insert
  with check (org_id = current_org_id());

create policy "org members can update their menu item margin impacts"
  on menu_item_margin_impacts for update
  using (org_id = current_org_id())
  with check (org_id = current_org_id());

create policy "org members can delete their menu item margin impacts"
  on menu_item_margin_impacts for delete
  using (org_id = current_org_id());
