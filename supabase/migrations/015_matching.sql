set search_path to "$user", public, extensions;

-- §5.2 step 5b: cosine-similarity search of one invoice line's embedding
-- against the caller's own ingredient embeddings. security invoker, so the
-- ingredients RLS policy still applies; the explicit org_id filter just
-- keeps the planner (and a reader) honest about the scoping.
--
-- Deliberately an exact search, not an HNSW index scan: ordering by the
-- similarity expression (rather than `embedding <=> q`) keeps the planner off
-- the global ingredients_embedding_hnsw_idx and on ingredients_org_id_idx.
-- The HNSW index is shared by every org and applies the org filter *after*
-- picking its candidate set, so for one org among many it can return fewer
-- than match_count rows — silently routing good matches to 'new_ingredient'.
-- An org's ingredient list is hundreds of rows, so exact is cheap and correct.
create or replace function match_ingredients(query_embedding vector(1024), match_count integer default 3)
returns table (ingredient_id uuid, name text, similarity double precision)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select i.id, i.name, 1 - (i.embedding <=> query_embedding) as similarity
  from ingredients i
  where i.org_id = current_org_id()
    and i.embedding is not null
  order by 1 - (i.embedding <=> query_embedding) desc
  limit match_count;
$$;

-- §6.3, per-invoice half of the hard review gate: an invoice may only reach
-- 'completed' when none of its line items are unresolved. Enforced here, not
-- just in the route handlers, so there is no code path around it.
create or replace function enforce_invoice_review_gate()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'completed' and exists (
    select 1 from invoice_line_items
    where invoice_id = new.id
      and match_status in ('pending', 'needs_review', 'new_ingredient')
  ) then
    raise exception 'Invoice % cannot be completed while it has unreviewed line items', new.id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger invoices_review_gate
  before insert or update of status on invoices
  for each row
  execute function enforce_invoice_review_gate();
