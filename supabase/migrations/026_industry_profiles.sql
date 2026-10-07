set search_path to "$user", public, extensions;

-- Industry profiles (lib/industries/index.ts). organizations.business_type
-- was free text; it becomes one of the registry's ids (or null = not said,
-- which reads as food). Keep this list in step with INDUSTRY_IDS.
--
-- Rollback: supabase/rollback/026_industry_profiles.down.sql.

-- Same rule as normalizeIndustryId() in the app: trimmed, lowercased,
-- spaces/hyphens → "_"; blank → null; anything unknown → 'other'.
create or replace function public.normalize_business_type(value text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when value is null or btrim(value) = '' then null
    when regexp_replace(lower(btrim(value)), '[\s-]+', '_', 'g')
         in ('bakery', 'food_truck', 'caterer', 'jewelry', 'florist', 'metalworking', 'other')
      then regexp_replace(lower(btrim(value)), '[\s-]+', '_', 'g')
    else 'other'
  end
$$;

-- List every row whose value changes (shown in the migration output), then
-- normalize. On 2026-10-06 the live table had none to change: bakery,
-- caterer and null only.
do $$
declare
  r record;
  n integer := 0;
begin
  for r in
    select id, name, business_type, public.normalize_business_type(business_type) as normalized
      from organizations
     where business_type is distinct from public.normalize_business_type(business_type)
  loop
    raise notice 'business_type remapped: org % (%) % -> %', r.id, r.name, quote_nullable(r.business_type), quote_nullable(r.normalized);
    n := n + 1;
  end loop;
  raise notice '% organization row(s) remapped', n;
end $$;

update organizations
   set business_type = public.normalize_business_type(business_type)
 where business_type is distinct from public.normalize_business_type(business_type);

alter table organizations
  add constraint organizations_business_type_check
  check (business_type is null or business_type in ('bakery', 'food_truck', 'caterer', 'jewelry', 'florist', 'metalworking', 'other'));

-- Per-org overrides of the profile (preferred units/categories, show_labor,
-- default waste/overhead). The app ignores anything it doesn't understand.
alter table organizations
  add column industry_settings jsonb not null default '{}'::jsonb
    check (jsonb_typeof(industry_settings) = 'object');

-- Signup (migration 012) stores whatever business_type the signup metadata
-- carried; normalize it so a stray value can't fail the check above and with
-- it the whole signup. Otherwise unchanged.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  new_org_id uuid;
begin
  insert into organizations (name, business_type)
  values (
    coalesce(new.raw_user_meta_data->>'business_name', 'My Business'),
    public.normalize_business_type(new.raw_user_meta_data->>'business_type')
  )
  returning id into new_org_id;

  insert into profiles (id, org_id, full_name)
  values (new.id, new_org_id, new.raw_user_meta_data->>'full_name');

  return new;
end;
$$;
