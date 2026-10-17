-- Pricing by markup (lib/costing/markup.ts): an owner who prices by
-- multiplier (keystone 2×) sets target_markup; target_margin_pct keeps the
-- same target as a margin (2× = 50%) for anything that reads only that.
-- null = prices by margin, as every org does today. Nothing else changes.
set search_path to "$user", public, extensions;

alter table organizations
  add column target_markup numeric(6,3)
    check (target_markup is null or (target_markup > 1 and target_markup <= 100));
