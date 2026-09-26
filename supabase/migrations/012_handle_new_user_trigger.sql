set search_path to "$user", public, extensions;

-- Signup creates an organizations row and a profiles row in one atomic
-- operation (§13 step 2). Implemented as a trigger on auth.users rather than
-- a two-step Next.js server action: a trigger runs in the same transaction
-- as the auth.users insert, so there is no window where a user can exist
-- without an org (which a client-side "sign up, then call an API" sequence
-- cannot guarantee if the second step fails). It also means any path that
-- creates a Supabase Auth user — the app's signup form, the Admin API, a
-- future invite flow — gets org creation for free.
--
-- business_name / business_type / full_name are read from the signup call's
-- user_metadata (supabase.auth.signUp({ options: { data: { ... } } })).
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

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
