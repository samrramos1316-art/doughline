-- Build step 8: confirmed invoice prices flow into ingredient costs, price
-- alerts, and the menu-item margin-impact cascade (ARCHITECTURE.md §5.2
-- step 8, §6.1, §6.2).

-- Pack size as printed ("36/1#" → 36 lb), so a per-case invoice price can be
-- converted to the ingredient's base unit; and the outcome of applying the
-- line's price, so it's applied exactly once and a skipped conversion is
-- visible rather than silent.
alter table invoice_line_items
  add column parsed_pack_quantity numeric(12,4),
  add column parsed_pack_unit text,
  add column base_unit_cost numeric(12,4),
  add column price_applied_at timestamptz,
  add column price_note text;

-- Applies one matched line's price, converted by the caller to the
-- ingredient's base unit, in a single transaction:
--   1. record ingredient_price_history and move ingredients.current_unit_cost
--   2. if the change exceeds organizations.price_alert_threshold_pct (either
--      direction), insert price_alerts
--   3. …and one menu_item_margin_impacts row per active menu item whose
--      recipe uses the ingredient, with before/after read from the
--      menu_item_margins view itself — once before the cost moves and once
--      after, in the same transaction — so the numbers come from exactly the
--      formula the dashboard shows.
-- Idempotent per line (price_applied_at). security invoker: RLS applies.
create or replace function apply_line_item_price(p_line_item_id uuid, p_base_unit_cost numeric)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  li record;
  ing record;
  threshold numeric;
  prev numeric;
  pct numeric;
  alert_id uuid;
  before_rows jsonb;
  impact_count integer := 0;
begin
  if p_base_unit_cost is null or p_base_unit_cost < 0 then
    raise exception 'base unit cost must be a non-negative number' using errcode = 'check_violation';
  end if;

  select l.id, l.org_id, l.invoice_id, l.matched_ingredient_id, l.parsed_quantity, l.price_applied_at,
         i.vendor_id, i.invoice_date
    into li
    from invoice_line_items l
    join invoices i on i.id = l.invoice_id
   where l.id = p_line_item_id
     for update of l;
  if not found then
    raise exception 'Line item % not found', p_line_item_id using errcode = 'no_data_found';
  end if;
  if li.price_applied_at is not null then
    return jsonb_build_object('applied', false, 'reason', 'already_applied');
  end if;
  if li.matched_ingredient_id is null then
    raise exception 'Line item % is not matched to an ingredient', p_line_item_id using errcode = 'check_violation';
  end if;

  select id, base_unit, current_unit_cost into ing
    from ingredients where id = li.matched_ingredient_id
     for update;
  prev := ing.current_unit_cost;

  select price_alert_threshold_pct into threshold from organizations where id = li.org_id;

  if prev is not null and prev > 0 then
    pct := round((p_base_unit_cost - prev) / prev * 100, 2);
  end if;

  if pct is not null and abs(pct) > threshold then
    select coalesce(jsonb_agg(jsonb_build_object(
             'menu_item_id', m.menu_item_id,
             'recipe_id', mi.recipe_id,
             'margin_pct', m.margin_pct,
             'margin_amount', m.margin_amount)), '[]'::jsonb)
      into before_rows
      from menu_item_margins m
      join menu_items mi on mi.id = m.menu_item_id
     where mi.is_active
       and mi.recipe_id in (select recipe_id from recipe_ingredients where ingredient_id = ing.id);
  end if;

  insert into ingredient_price_history (org_id, ingredient_id, vendor_id, invoice_id, unit_cost, unit, quantity, effective_date, source)
  values (li.org_id, ing.id, li.vendor_id, li.invoice_id, p_base_unit_cost, ing.base_unit, li.parsed_quantity,
          coalesce(li.invoice_date, current_date), 'invoice_scan');

  update ingredients
     set current_unit_cost = p_base_unit_cost,
         current_unit_cost_updated_at = now(),
         updated_at = now()
   where id = ing.id;

  update invoice_line_items
     set base_unit_cost = p_base_unit_cost,
         price_applied_at = now(),
         price_note = null
   where id = li.id;

  if before_rows is not null then
    insert into price_alerts (org_id, ingredient_id, invoice_id, previous_unit_cost, new_unit_cost, pct_change)
    values (li.org_id, ing.id, li.invoice_id, prev, p_base_unit_cost, pct)
    returning id into alert_id;

    insert into menu_item_margin_impacts (
      org_id, price_alert_id, menu_item_id, recipe_id,
      previous_margin_pct, new_margin_pct, margin_pct_delta,
      previous_margin_amount, new_margin_amount)
    select li.org_id, alert_id, b.menu_item_id, b.recipe_id,
           b.margin_pct, a.margin_pct, a.margin_pct - b.margin_pct,
           b.margin_amount, a.margin_amount
      from jsonb_to_recordset(before_rows)
           as b(menu_item_id uuid, recipe_id uuid, margin_pct numeric, margin_amount numeric)
      join menu_item_margins a on a.menu_item_id = b.menu_item_id;
    get diagnostics impact_count = row_count;
  end if;

  return jsonb_build_object(
    'applied', true,
    'ingredient_id', ing.id,
    'previous_unit_cost', prev,
    'new_unit_cost', p_base_unit_cost,
    'pct_change', pct,
    'threshold_pct', threshold,
    'price_alert_id', alert_id,
    'impacts', impact_count);
end;
$$;
