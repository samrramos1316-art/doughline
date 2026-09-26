-- Supabase relocates extensions into the `extensions` schema via an event
-- trigger regardless of how CREATE EXTENSION is declared, and a fresh
-- session's search_path doesn't include it by default. Set it at the
-- database level (persists for all future connections, e.g. the app and the
-- SQL editor) and for this session so unqualified calls to
-- uuid_generate_v4(), the vector type, vector_cosine_ops, etc. resolve.
alter database postgres set search_path to "$user", public, extensions;
set search_path to "$user", public, extensions;

create table organizations (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  business_type text, -- 'bakery' | 'food_truck' | 'caterer' | 'other', free text for v1
  subscription_tier text not null default 'trial', -- 'trial' | 'starter' | 'pro'
  stripe_customer_id text,
  price_alert_threshold_pct numeric(5,2) not null default 8.00, -- org-configurable sensitivity for ingredient price alerts
  max_unreviewed_line_items integer not null default 15, -- see §6.3 hard review gate
  target_margin_pct numeric(5,2) not null default 65.00, -- default target used by the suggestion engine, §8
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- one row per auth user, links them to an org
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  full_name text,
  role text not null default 'owner', -- 'owner' | 'staff' — future multi-user support
  created_at timestamptz not null default now()
);

create index profiles_org_id_idx on profiles(org_id);

-- helper used by every RLS policy below; security definer so it can read
-- profiles without recursing into the RLS policy on profiles itself
create or replace function current_org_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select org_id from profiles where id = auth.uid()
$$;
