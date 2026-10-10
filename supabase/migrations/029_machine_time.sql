set search_path to "$user", public, extensions;

-- Machine time on jobs (docs/architecture.md §14.2: metalworking's extra
-- costs are "labor, machine time, scrap/kerf, outsourcing"). A recipe (a
-- job, for fabrication) logs machine minutes at a machine hourly rate,
-- separate from hands-on labor — a laser or press-brake hour costs what the
-- machine costs, not what the operator earns.
--
-- Per recipe batch, as migration 025 with one more term:
--   machine          = machine_minutes × coalesce(recipe rate, org default machine rate) / 60
--   batch_total_cost = (materials + labor + machine) × (1 + overhead_pct/100)
-- Every new column defaults to 0 (or null → the org default, itself 0), and
-- a recipe with no machine time is costed by exactly the expression 025/027
-- used, so no existing cost changes (not even its numeric scale).
-- lib/costing/recipeCost.ts is the same formula; keep the two in step.
--
-- Rollback: supabase/rollback/029_machine_time.down.sql.

alter table recipes
  add column machine_minutes numeric(8,2) not null default 0 check (machine_minutes >= 0),
  add column machine_rate_per_hour numeric(8,2) check (machine_rate_per_hour >= 0); -- null = organizations.default_machine_rate_per_hour

alter table organizations
  add column default_machine_rate_per_hour numeric(8,2) not null default 0
    check (default_machine_rate_per_hour >= 0);

-- As migration 027, with machine_cost appended (create or replace may only
-- add columns at the end; menu_item_margins keeps working unchanged).
create or replace view recipe_costs with (security_invoker = true) as
with lines as (
  select
    r.id as recipe_id,
    case when bool_and(i.current_unit_cost is not null) then
      sum(case when coalesce(ri.waste_pct, i.waste_pct) = 0
        then ri.quantity * i.current_unit_cost
        else ri.quantity / (1 - coalesce(ri.waste_pct, i.waste_pct) / 100) * i.current_unit_cost
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
  lab.labor_cost,
  mach.machine_cost
from lines l
join recipes r on r.id = l.recipe_id
left join organizations o on o.id = r.org_id
cross join lateral (
  select r.labor_minutes * coalesce(r.labor_rate_per_hour, o.default_labor_rate_per_hour, 0) / 60 as labor_cost
) lab
cross join lateral (
  select r.machine_minutes * coalesce(r.machine_rate_per_hour, o.default_machine_rate_per_hour, 0) / 60 as machine_cost
) mach
cross join lateral (
  -- No machine time: exactly migration 025's expression, untouched.
  select case
    when l.materials_cost is null then null
    when mach.machine_cost = 0 and lab.labor_cost = 0 and r.overhead_pct = 0 then l.materials_cost
    when mach.machine_cost = 0 then (l.materials_cost + lab.labor_cost) * (1 + r.overhead_pct / 100)
    else (l.materials_cost + lab.labor_cost + mach.machine_cost) * (1 + r.overhead_pct / 100)
  end as batch_total_cost
) t;

-- Per serving, as migration 025, with machine_cost appended.
create or replace view menu_item_margins with (security_invoker = true) as
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
  rc.labor_cost / s.servings as labor_cost,
  rc.machine_cost / s.servings as machine_cost
from menu_items m
left join recipe_costs rc on rc.recipe_id = m.recipe_id
cross join lateral (
  select nullif(coalesce(m.servings_per_batch, rc.batch_yield_qty), 0) as servings
) sv
cross join lateral (
  select sv.servings, rc.batch_total_cost / sv.servings as cost_per_serving
) s;
