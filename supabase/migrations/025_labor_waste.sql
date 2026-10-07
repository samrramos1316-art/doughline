set search_path to "$user", public, extensions;

-- Costing beyond ingredients: waste/scrap per recipe line, labor time per
-- batch and an overhead percentage on top. Every new column defaults to 0
-- (or null, falling back to the org's default rate, itself 0), so a recipe
-- nobody has touched costs exactly what it did before.
--
-- Per recipe batch:
--   materials        = Σ quantity / (1 − waste_pct/100) × current_unit_cost
--   labor            = labor_minutes × coalesce(recipe rate, org default rate) / 60
--   batch_total_cost = (materials + labor) × (1 + overhead_pct/100)
-- lib/costing/recipeCost.ts is the same formula for the app's own math
-- (dashboard history, margins tab, suggestions); keep the two in step.
--
-- New columns inherit the tables' existing RLS policies. The price cascade
-- (apply_line_item_price, migrations 017/019) reads before/after margins from
-- menu_item_margins, so it picks the new formula up with no change.
--
-- Rollback: supabase/rollback/025_labor_waste.down.sql.

alter table recipe_ingredients
  add column waste_pct numeric(5,2) not null default 0
    check (waste_pct >= 0 and waste_pct < 100);

alter table recipes
  add column labor_minutes numeric(8,2) not null default 0 check (labor_minutes >= 0),
  add column labor_rate_per_hour numeric(8,2) check (labor_rate_per_hour >= 0), -- null = organizations.default_labor_rate_per_hour
  add column overhead_pct numeric(5,2) not null default 0 check (overhead_pct >= 0);

alter table organizations
  add column default_labor_rate_per_hour numeric(8,2) not null default 0
    check (default_labor_rate_per_hour >= 0);

-- Dropped and recreated (dependents first) rather than `create or replace`,
-- so the new definitions are stated whole. Same columns, names and order as
-- migration 023, with materials_cost and labor_cost appended.
drop view menu_item_margins;
drop view recipe_costs;

-- A line with no waste is costed as quantity × cost exactly as before (no
-- division at all), so untouched recipes keep identical numbers. An unpriced
-- ingredient still makes the whole cost unknown (migration 023).
create view recipe_costs with (security_invoker = true) as
with lines as (
  select
    r.id as recipe_id,
    case when bool_and(i.current_unit_cost is not null) then
      sum(case when ri.waste_pct = 0
        then ri.quantity * i.current_unit_cost
        else ri.quantity / (1 - ri.waste_pct / 100) * i.current_unit_cost
      end)
    end as materials_cost,
    count(*) filter (where i.current_unit_cost is null)::int as unpriced_ingredients
  from recipes r
  join recipe_ingredients ri on ri.recipe_id = r.id
  join ingredients i on i.id = ri.ingredient_id
  group by r.id
)
select
  r.id as recipe_id,
  r.org_id,
  r.name,
  r.batch_yield_qty,
  r.batch_yield_unit,
  t.batch_total_cost,
  t.batch_total_cost / nullif(r.batch_yield_qty, 0) as cost_per_serving,
  l.unpriced_ingredients,
  l.materials_cost,
  lab.labor_cost
from lines l
join recipes r on r.id = l.recipe_id
left join organizations o on o.id = r.org_id
cross join lateral (
  select r.labor_minutes * coalesce(r.labor_rate_per_hour, o.default_labor_rate_per_hour, 0) / 60 as labor_cost
) lab
cross join lateral (
  -- No labor and no overhead: the materials sum itself, untouched (× 1.00…
  -- would widen the numeric's scale and could move the last digit of
  -- cost_per_serving).
  select case
    when l.materials_cost is null then null
    when lab.labor_cost = 0 and r.overhead_pct = 0 then l.materials_cost
    else (l.materials_cost + lab.labor_cost) * (1 + r.overhead_pct / 100)
  end as batch_total_cost
) t;

-- Per menu-item serving, as before: the item's servings_per_batch override,
-- else the recipe's yield (migration 014). materials_cost / labor_cost are
-- per serving here too.
create view menu_item_margins with (security_invoker = true) as
select
  m.id as menu_item_id,
  m.org_id,
  m.name,
  m.selling_price,
  s.cost_per_serving,
  (m.selling_price - s.cost_per_serving) as margin_amount,
  case when m.selling_price > 0
    then round(((m.selling_price - s.cost_per_serving) / m.selling_price) * 100, 2)
    else null
  end as margin_pct,
  coalesce(rc.unpriced_ingredients, 0) as unpriced_ingredients,
  rc.materials_cost / s.servings as materials_cost,
  rc.labor_cost / s.servings as labor_cost
from menu_items m
left join recipe_costs rc on rc.recipe_id = m.recipe_id
cross join lateral (
  select nullif(coalesce(m.servings_per_batch, rc.batch_yield_qty), 0) as servings
) sv
cross join lateral (
  select sv.servings, rc.batch_total_cost / sv.servings as cost_per_serving
) s;
