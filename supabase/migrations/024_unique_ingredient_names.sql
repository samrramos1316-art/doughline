-- One ingredient per name per org (case- and whitespace-insensitive).
--
-- A slow "Add & match" invited a second click and created the same
-- ingredient twice; the grid and CSV import already match by name, so a
-- duplicate was never intended anywhere. First fold any existing duplicates
-- into the oldest copy — everything that points at a duplicate is moved to
-- the keeper — then make the database refuse new ones.

create temporary table ingredient_dupes on commit drop as
select id as dupe_id, keeper_id
from (
  select
    id,
    first_value(id) over (partition by org_id, lower(trim(name)) order by created_at, id) as keeper_id
  from ingredients
) ranked
where id <> keeper_id;

update invoice_line_items t set matched_ingredient_id = d.keeper_id
from ingredient_dupes d where t.matched_ingredient_id = d.dupe_id;

update vendor_ingredient_aliases t set ingredient_id = d.keeper_id
from ingredient_dupes d where t.ingredient_id = d.dupe_id;

update recipe_ingredients t set ingredient_id = d.keeper_id
from ingredient_dupes d where t.ingredient_id = d.dupe_id;

update ingredient_price_history t set ingredient_id = d.keeper_id
from ingredient_dupes d where t.ingredient_id = d.dupe_id;

update price_alerts t set ingredient_id = d.keeper_id
from ingredient_dupes d where t.ingredient_id = d.dupe_id;

delete from ingredients where id in (select dupe_id from ingredient_dupes);

create unique index ingredients_org_name_unique on ingredients (org_id, lower(trim(name)));
