-- Rollback for migrations/030_target_markup.sql (not run by the CLI):
--   npx supabase db query --linked -f supabase/rollback/030_target_markup.down.sql
--   npx supabase migration repair --status reverted 030
-- Owners who priced by markup go back to their target_margin_pct, which
-- already holds the same target as a margin.
set search_path to "$user", public, extensions;

alter table organizations drop column target_markup;
