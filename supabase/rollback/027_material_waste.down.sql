-- Rollback for migrations/027_material_waste.sql (not run by the CLI):
--   npx supabase db query --linked -f supabase/rollback/027_material_waste.down.sql
--   npx supabase migration repair --status reverted 027
-- Drops the per-material waste %. Lines that were following their material
-- get 0 back (not the material's %), so recipes using a material loss % will
-- cost less after this; lines with their own % keep it.
set search_path to "$user", public, extensions;

begin;

-- recipe_costs exactly as migration 025 defined it.
create or replace view recipe_costs with (security_invoker = true) as
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
  select case
    when l.materials_cost is null then null
    when lab.labor_cost = 0 and r.overhead_pct = 0 then l.materials_cost
    else (l.materials_cost + lab.labor_cost) * (1 + r.overhead_pct / 100)
  end as batch_total_cost
) t;

update recipe_ingredients set waste_pct = 0 where waste_pct is null;
alter table recipe_ingredients
  alter column waste_pct set default 0,
  alter column waste_pct set not null;

alter table ingredients drop column waste_pct;

commit;
