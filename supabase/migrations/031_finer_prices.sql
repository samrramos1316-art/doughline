set search_path to "$user", public, extensions;

-- Unit prices and recipe amounts to 8 decimal places (were 4). At 4, cheap
-- materials costed per small unit lost real money to rounding: butter at
-- $4.00/lb is $0.00881849/g but was stored as $0.0088 (0.2% low), and 3 g of
-- something costed per lb (0.00661387 lb) was stored as 0.0066. Over a big
-- recipe or a year of invoices that adds up. numeric(18,8) keeps 10 digits
-- before the point, more than (12,4) allowed.
--
-- Widened: ingredients.current_unit_cost, ingredient_price_history.unit_cost,
-- invoice_line_items.base_unit_cost, price_alerts.previous/new_unit_cost and
-- recipe_ingredients.quantity. Widening never changes a stored value; prices
-- already rounded stay as they are until the next invoice or edit.
--
-- The costing views read two of these columns, and Postgres won't change a
-- column's type under a view, so both are dropped and recreated exactly as
-- migration 029 left them.
--
-- Rollback: supabase/rollback/031_finer_prices.down.sql.

drop view menu_item_margins;
drop view recipe_costs;

alter table ingredients alter column current_unit_cost type numeric(18,8);
alter table ingredient_price_history alter column unit_cost type numeric(18,8);
alter table invoice_line_items alter column base_unit_cost type numeric(18,8);
alter table price_alerts
  alter column previous_unit_cost type numeric(18,8),
  alter column new_unit_cost type numeric(18,8);
alter table recipe_ingredients alter column quantity type numeric(18,8);

-- As migration 029.
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
  select case
    when l.materials_cost is null then null
    when mach.machine_cost = 0 and lab.labor_cost = 0 and r.overhead_pct = 0 then l.materials_cost
    when mach.machine_cost = 0 then (l.materials_cost + lab.labor_cost) * (1 + r.overhead_pct / 100)
    else (l.materials_cost + lab.labor_cost + mach.machine_cost) * (1 + r.overhead_pct / 100)
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
