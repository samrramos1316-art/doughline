-- Rollback for migrations/025_labor_waste.sql. Not in migrations/, so the
-- Supabase CLI never runs it on its own. To undo 025 on the linked project:
--   npx supabase db query --linked -f supabase/rollback/025_labor_waste.down.sql
--   npx supabase migration repair --status reverted 025
-- (or paste it into the SQL editor). It drops the waste, labor and overhead
-- values people have entered, and restores the views exactly as migration
-- 023 left them.
set search_path to "$user", public, extensions;

begin;

drop view menu_item_margins;
drop view recipe_costs;

alter table recipe_ingredients drop column waste_pct;
alter table recipes
  drop column labor_minutes,
  drop column labor_rate_per_hour,
  drop column overhead_pct;
alter table organizations drop column default_labor_rate_per_hour;

create view recipe_costs with (security_invoker = true) as
select
  r.id as recipe_id,
  r.org_id,
  r.name,
  r.batch_yield_qty,
  r.batch_yield_unit,
  case when bool_and(i.current_unit_cost is not null) then sum(ri.quantity * i.current_unit_cost) end as batch_total_cost,
  case when bool_and(i.current_unit_cost is not null) then sum(ri.quantity * i.current_unit_cost) / nullif(r.batch_yield_qty, 0) end as cost_per_serving,
  count(*) filter (where i.current_unit_cost is null)::int as unpriced_ingredients
from recipes r
join recipe_ingredients ri on ri.recipe_id = r.id
join ingredients i on i.id = ri.ingredient_id
group by r.id;

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
  coalesce(rc.unpriced_ingredients, 0) as unpriced_ingredients
from menu_items m
left join recipe_costs rc on rc.recipe_id = m.recipe_id
cross join lateral (
  select rc.batch_total_cost
    / nullif(coalesce(m.servings_per_batch, rc.batch_yield_qty), 0) as cost_per_serving
) s;

commit;
