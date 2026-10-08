set search_path to "$user", public, extensions;

-- Waste/loss % per material (docs/jewelry-florist-functionality.md §1.1,
-- architecture.md §14.2 item 2): set "gold loses 3%" once on the ingredient
-- and every recipe line using it picks it up. A recipe line's own waste_pct
-- (migration 025) becomes an optional override: null = the material's %.
--
-- Effective waste on a line = coalesce(line waste_pct, ingredient waste_pct).
-- Every ingredient starts at 0 and every existing line at 0 becomes null
-- (= the material's 0), so no cost changes. Lines with a waste % keep it.
--
-- lib/costing/recipeCost.ts (effectiveWastePct) is the same rule for the
-- app's own math; keep the two in step.
--
-- Rollback: supabase/rollback/027_material_waste.down.sql.

alter table ingredients
  add column waste_pct numeric(5,2) not null default 0
    check (waste_pct >= 0 and waste_pct < 100);

alter table recipe_ingredients
  alter column waste_pct drop not null,
  alter column waste_pct drop default;

update recipe_ingredients set waste_pct = null where waste_pct = 0;

-- As migration 025, with the line's waste falling back to the material's.
-- Same columns in the same order, so menu_item_margins (built on it) and the
-- price cascade are untouched. A line with no effective waste is still
-- quantity × cost exactly.
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
