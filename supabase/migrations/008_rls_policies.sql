set search_path to "$user", public, extensions;

-- Enable RLS on every tenant table that exists as of this migration and scope
-- all four operations to current_org_id(). commodity_price_series and
-- menu_item_margin_impacts get their RLS policies in the migrations that
-- create them (010, 011) rather than forward-referenced here.

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

-- profiles is special: a user can only ever see/edit their own row
alter table profiles enable row level security;

create policy "users can read their own profile"
  on profiles for select
  using (id = auth.uid());

create policy "users can update their own profile"
  on profiles for update
  using (id = auth.uid());

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

-- vendors
alter table vendors enable row level security;

create policy "org members can read their vendors"
  on vendors for select
  using (org_id = current_org_id());

create policy "org members can insert their vendors"
  on vendors for insert
  with check (org_id = current_org_id());

create policy "org members can update their vendors"
  on vendors for update
  using (org_id = current_org_id())
  with check (org_id = current_org_id());

create policy "org members can delete their vendors"
  on vendors for delete
  using (org_id = current_org_id());

-- invoices
alter table invoices enable row level security;

create policy "org members can read their invoices"
  on invoices for select
  using (org_id = current_org_id());

create policy "org members can insert their invoices"
  on invoices for insert
  with check (org_id = current_org_id());

create policy "org members can update their invoices"
  on invoices for update
  using (org_id = current_org_id())
  with check (org_id = current_org_id());

create policy "org members can delete their invoices"
  on invoices for delete
  using (org_id = current_org_id());

-- invoice_line_items
alter table invoice_line_items enable row level security;

create policy "org members can read their invoice line items"
  on invoice_line_items for select
  using (org_id = current_org_id());

create policy "org members can insert their invoice line items"
  on invoice_line_items for insert
  with check (org_id = current_org_id());

create policy "org members can update their invoice line items"
  on invoice_line_items for update
  using (org_id = current_org_id())
  with check (org_id = current_org_id());

create policy "org members can delete their invoice line items"
  on invoice_line_items for delete
  using (org_id = current_org_id());

-- ingredient_price_history
alter table ingredient_price_history enable row level security;

create policy "org members can read their ingredient price history"
  on ingredient_price_history for select
  using (org_id = current_org_id());

create policy "org members can insert their ingredient price history"
  on ingredient_price_history for insert
  with check (org_id = current_org_id());

create policy "org members can update their ingredient price history"
  on ingredient_price_history for update
  using (org_id = current_org_id())
  with check (org_id = current_org_id());

create policy "org members can delete their ingredient price history"
  on ingredient_price_history for delete
  using (org_id = current_org_id());

-- vendor_ingredient_aliases
alter table vendor_ingredient_aliases enable row level security;

create policy "org members can read their vendor ingredient aliases"
  on vendor_ingredient_aliases for select
  using (org_id = current_org_id());

create policy "org members can insert their vendor ingredient aliases"
  on vendor_ingredient_aliases for insert
  with check (org_id = current_org_id());

create policy "org members can update their vendor ingredient aliases"
  on vendor_ingredient_aliases for update
  using (org_id = current_org_id())
  with check (org_id = current_org_id());

create policy "org members can delete their vendor ingredient aliases"
  on vendor_ingredient_aliases for delete
  using (org_id = current_org_id());

-- recipes
alter table recipes enable row level security;

create policy "org members can read their recipes"
  on recipes for select
  using (org_id = current_org_id());

create policy "org members can insert their recipes"
  on recipes for insert
  with check (org_id = current_org_id());

create policy "org members can update their recipes"
  on recipes for update
  using (org_id = current_org_id())
  with check (org_id = current_org_id());

create policy "org members can delete their recipes"
  on recipes for delete
  using (org_id = current_org_id());

-- recipe_ingredients
alter table recipe_ingredients enable row level security;

create policy "org members can read their recipe ingredients"
  on recipe_ingredients for select
  using (org_id = current_org_id());

create policy "org members can insert their recipe ingredients"
  on recipe_ingredients for insert
  with check (org_id = current_org_id());

create policy "org members can update their recipe ingredients"
  on recipe_ingredients for update
  using (org_id = current_org_id())
  with check (org_id = current_org_id());

create policy "org members can delete their recipe ingredients"
  on recipe_ingredients for delete
  using (org_id = current_org_id());

-- menu_items
alter table menu_items enable row level security;

create policy "org members can read their menu items"
  on menu_items for select
  using (org_id = current_org_id());

create policy "org members can insert their menu items"
  on menu_items for insert
  with check (org_id = current_org_id());

create policy "org members can update their menu items"
  on menu_items for update
  using (org_id = current_org_id())
  with check (org_id = current_org_id());

create policy "org members can delete their menu items"
  on menu_items for delete
  using (org_id = current_org_id());

-- price_alerts
alter table price_alerts enable row level security;

create policy "org members can read their price alerts"
  on price_alerts for select
  using (org_id = current_org_id());

create policy "org members can insert their price alerts"
  on price_alerts for insert
  with check (org_id = current_org_id());

create policy "org members can update their price alerts"
  on price_alerts for update
  using (org_id = current_org_id())
  with check (org_id = current_org_id());

create policy "org members can delete their price alerts"
  on price_alerts for delete
  using (org_id = current_org_id());

-- All Storage access follows the same pattern: the invoice-files bucket is
-- private, and a Storage RLS policy checks that the path's leading segment
-- (the org_id folder) matches current_org_id().
