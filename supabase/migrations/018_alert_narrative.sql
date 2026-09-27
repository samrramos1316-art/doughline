-- Build step 9 (ARCHITECTURE.md §8): the optional Claude-written narrative is
-- one call per alert, so it's generated once and cached on the alert rather
-- than re-requested on every page view.
alter table price_alerts
  add column ai_narrative text,
  add column ai_narrative_model text,
  add column ai_narrative_generated_at timestamptz;
