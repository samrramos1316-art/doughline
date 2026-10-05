set search_path to "$user", public, extensions;

-- The pre-launch gate (lib/access.ts) was enforced only by the app: the
-- signup server action checks DOUGHTALLY_ALLOWED_EMAILS before calling
-- supabase.auth.signUp. But the publishable key is public, so anyone could
-- call Supabase Auth's signup endpoint directly, and handle_new_user (012)
-- would give them an organization. This enforces the same rule inside the
-- database, so it holds no matter which path creates the auth user.
--
-- Off by default, which leaves signups unchanged. To close signups, mirror
-- the env vars here (SQL editor, as the postgres role):
--   update signup_gate set closed = true;
--   insert into signup_allowed_emails (email) values ('owner@example.com');
-- Keep these in step with DOUGHTALLY_ACCESS / DOUGHTALLY_ALLOWED_EMAILS: the
-- app checks the env vars on every request, the database checks these rows
-- when an account is created.

create table signup_gate (
  id boolean primary key default true check (id), -- single row
  closed boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into signup_gate (id, closed) values (true, false);

create table signup_allowed_emails (
  email text primary key check (email = lower(trim(email))),
  created_at timestamptz not null default now()
);

-- Configuration, not tenant data: RLS on with no policies, so the API roles
-- (anon, authenticated) can't read or change it. The postgres role and the
-- secret key bypass RLS.
alter table signup_gate enable row level security;
alter table signup_allowed_emails enable row level security;
revoke all on signup_gate, signup_allowed_emails from anon, authenticated;

create or replace function public.enforce_signup_gate()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if (select closed from signup_gate where id) and not exists (
    select 1 from signup_allowed_emails where email = lower(trim(new.email))
  ) then
    raise exception 'Signups are closed' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- BEFORE insert, so a rejected signup never creates the user (or, via
-- handle_new_user's AFTER trigger, an organization).
create trigger on_auth_user_signup_gate
  before insert on auth.users
  for each row execute function public.enforce_signup_gate();
