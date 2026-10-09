-- Rollback for migrations/028_pack_sizes.sql (not run by the CLI):
--   npx supabase db query --linked -f supabase/rollback/028_pack_sizes.down.sql
--   npx supabase migration repair --status reverted 028
-- Drops the per-material pack sizes. Prices already applied with them stay
-- as they are; new bunch/box lines without a printed pack size go back to
-- "can't convert".
set search_path to "$user", public, extensions;

alter table ingredients drop column pack_sizes;
