-- Rollback for migrations/026_industry_profiles.sql (not run by the CLI):
--   npx supabase db query --linked -f supabase/rollback/026_industry_profiles.down.sql
--   npx supabase migration repair --status reverted 026
-- Drops per-org industry_settings. Normalized business_type values stay
-- normalized (the originals weren't kept; 026's output lists any it changed).
set search_path to "$user", public, extensions;

begin;

alter table organizations drop constraint organizations_business_type_check;
alter table organizations drop column industry_settings;

-- handle_new_user exactly as migration 012 defined it.
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
    new.raw_user_meta_data->>'business_type'
  )
  returning id into new_org_id;

  insert into profiles (id, org_id, full_name)
  values (new.id, new_org_id, new.raw_user_meta_data->>'full_name');

  return new;
end;
$$;

drop function public.normalize_business_type(text);

commit;
