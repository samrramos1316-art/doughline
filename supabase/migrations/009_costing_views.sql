set search_path to "$user", public, extensions;

-- This is the piece that makes margins "automatically update" without a
-- recompute job: cost-per-serving and menu margin are views, not stored
-- columns. They inherit RLS from their underlying tables automatically
-- (Postgres evaluates the RLS of the base tables), so no separate policy is
-- needed here as long as they're created with the querying role's normal
-- permissions (not security definer).

create or replace view recipe_costs as
select
  r.id as recipe_id,
  r.org_id,
  r.name,
  r.batch_yield_qty,
  r.batch_yield_unit,
  sum(ri.quantity * i.current_unit_cost) as batch_total_cost,
  sum(ri.quantity * i.current_unit_cost) / nullif(r.batch_yield_qty, 0) as cost_per_serving
from recipes r
join recipe_ingredients ri on ri.recipe_id = r.id
join ingredients i on i.id = ri.ingredient_id
group by r.id;

create or replace view menu_item_margins as
select
  m.id as menu_item_id,
  m.org_id,
  m.name,
  m.selling_price,
  rc.cost_per_serving,
  (m.selling_price - rc.cost_per_serving) as margin_amount,
  case when m.selling_price > 0
    then round(((m.selling_price - rc.cost_per_serving) / m.selling_price) * 100, 2)
    else null
  end as margin_pct
from menu_items m
left join recipe_costs rc on rc.recipe_id = m.recipe_id;
