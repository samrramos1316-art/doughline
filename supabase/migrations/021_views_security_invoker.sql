set search_path to "$user", public, extensions;

-- 009's note was wrong: a Postgres view runs with its owner's privileges
-- unless it's created WITH (security_invoker = true). These views are owned
-- by `postgres`, which bypasses RLS, so any signed-in user could read every
-- organization's recipe costs and menu margins through them (the tables
-- underneath were protected; the views were not). With security_invoker the
-- base tables' RLS is evaluated as the querying user, so each org sees only
-- its own rows. scripts/test-rls-isolation.mjs now checks both views.

alter view recipe_costs set (security_invoker = true);
alter view menu_item_margins set (security_invoker = true);
