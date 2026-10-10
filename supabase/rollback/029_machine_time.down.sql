-- Rollback for migrations/029_machine_time.sql (not run by the CLI):
--   npx supabase db query --linked -f supabase/rollback/029_machine_time.down.sql
--   npx supabase migration repair --status reverted 029
-- Drops machine time; jobs that logged it cost less afterwards. The views go
-- back to migration 027's (menu_item_margins: 025's), recreated because a
-- view can't drop a column in place.
set search_path to "$user", public, extensions;

begin;

drop view menu_item_margins;
drop view recipe_costs;

create view recipe_costs with (security_invoker = true) as
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

alter table recipes drop column machine_minutes, drop column machine_rate_per_hour;
alter table organizations drop column default_machine_rate_per_hour;

commit;
