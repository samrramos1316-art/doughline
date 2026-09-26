set search_path to "$user", public, extensions;

create table recipes (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  batch_yield_qty numeric(12,4) not null, -- e.g. 24
  batch_yield_unit text not null,          -- e.g. 'servings', 'cookies', 'liters'
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table recipe_ingredients (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references organizations(id) on delete cascade,
  recipe_id uuid not null references recipes(id) on delete cascade,
  ingredient_id uuid not null references ingredients(id),
  quantity numeric(12,4) not null,
  unit text not null, -- must be convertible to ingredients.base_unit, see §5.4
  created_at timestamptz not null default now()
);

create index recipe_ingredients_recipe_idx on recipe_ingredients(recipe_id);

create table menu_items (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references organizations(id) on delete cascade,
  recipe_id uuid references recipes(id),
  name text not null,
  selling_price numeric(12,2) not null,
  servings_per_batch numeric(12,4), -- how many menu-item servings one recipe batch yields, if different from batch_yield_qty
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index menu_items_org_idx on menu_items(org_id, is_active);
