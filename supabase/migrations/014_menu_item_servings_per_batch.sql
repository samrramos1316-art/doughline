set search_path to "$user", public, extensions;

-- menu_items.servings_per_batch exists so a menu item can be sold in a
-- different portion than the recipe's own yield (e.g. a 24-cookie recipe
-- sold as 6-packs → servings_per_batch = 4). 009's menu_item_margins ignored
-- it and always divided by recipes.batch_yield_qty, so any item with an
-- override showed the wrong cost and margin. Per-item cost is now
-- batch_total_cost / coalesce(servings_per_batch, batch_yield_qty).
--
-- Same column names, order and types as 009, so `create or replace` works
-- and nothing reading the view changes.

create or replace view menu_item_margins as
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
  end as margin_pct
from menu_items m
left join recipe_costs rc on rc.recipe_id = m.recipe_id
cross join lateral (
  select rc.batch_total_cost
    / nullif(coalesce(m.servings_per_batch, rc.batch_yield_qty), 0) as cost_per_serving
) s;
