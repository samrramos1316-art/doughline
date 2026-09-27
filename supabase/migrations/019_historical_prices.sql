-- Build step 10 (§9.1 bulk backfill): an invoice dated before the newest
-- price already recorded for an ingredient goes into ingredient_price_history
-- only. It doesn't move ingredients.current_unit_cost back to an old price,
-- and it doesn't raise a price alert. Otherwise identical to migration 017.
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
  eff date;
  latest date;
  historical boolean;
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

  -- A backfilled invoice (§9.1) older than the newest price already on file
  -- is history, not news: record it, but don't roll current_unit_cost back
  -- to an old price or raise an alert about it.
  eff := coalesce(li.invoice_date, current_date);
  select max(effective_date) into latest from ingredient_price_history where ingredient_id = ing.id;
  historical := latest is not null and eff < latest;

  if prev is not null and prev > 0 then
    pct := round((p_base_unit_cost - prev) / prev * 100, 2);
  end if;

  if not historical and pct is not null and abs(pct) > threshold then
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
          eff, 'invoice_scan');

  if not historical then
    update ingredients
       set current_unit_cost = p_base_unit_cost,
           current_unit_cost_updated_at = now(),
           updated_at = now()
     where id = ing.id;
  end if;

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
    'historical', historical,
    'effective_date', eff,
    'latest_price_date', latest,
    'impacts', impact_count);
end;
$$;
