set search_path to "$user", public, extensions;

-- "Not an ingredient" (gloves, sanitizer, fuel surcharges) is a decision the
-- owner shouldn't have to repeat on every weekly invoice from the same
-- vendor. Remember it the same way a confirmed match is remembered: a vendor
-- alias for the printed text, flagged instead of pointing at an ingredient.
-- The next scan resolves the line to 'not_ingredient' without review.

alter table vendor_ingredient_aliases
  alter column ingredient_id drop not null,
  add column is_not_ingredient boolean not null default false,
  add constraint vendor_alias_target_check
    check (is_not_ingredient or ingredient_id is not null);
