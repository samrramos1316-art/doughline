set search_path to "$user", public, extensions;

-- Per-material pack sizes (docs/jewelry-florist-functionality.md §3:
-- stems "bought per stem, bunch or box (e.g. bunch of 10, box of 25) with
-- unit conversion"). How many of the material's base unit come in one of a
-- unit whose size varies by material: {"bunch": 10, "box": 25} on a rose
-- costed per stem. lib/costing/units.ts uses it only when an invoice line
-- is priced per bunch/box and doesn't print its own pack size — a case that
-- couldn't be converted before — so no existing price changes.
--
-- Rollback: supabase/rollback/028_pack_sizes.down.sql.

alter table ingredients
  add column pack_sizes jsonb not null default '{}'::jsonb
    check (jsonb_typeof(pack_sizes) = 'object');
