set search_path to "$user", public, extensions;

-- A recipe with an unpriced ingredient used to get a cost anyway: SUM()
-- skips NULLs, so the unpriced ingredient counted as free and the menu item
-- showed a better margin than it has (found by the onboarding import test —
-- a new "flaky sea salt" with no price yet). Now the cost is unknown until
-- every ingredient has a price, and both views say how many are missing so
-- the app can point the owner at them. Columns are only appended, so
-- `create or replace` keeps every reader working; security_invoker is
-- restated (migration 021).

create or replace view recipe_costs with (security_invoker = true) as
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
  coalesce(rc.unpriced_ingredients, 0) as unpriced_ingredients
from menu_items m
left join recipe_costs rc on rc.recipe_id = m.recipe_id
cross join lateral (
  select rc.batch_total_cost
    / nullif(coalesce(m.servings_per_batch, rc.batch_yield_qty), 0) as cost_per_serving
) s;
