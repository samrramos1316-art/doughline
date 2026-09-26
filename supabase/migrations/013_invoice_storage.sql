set search_path to "$user", public, extensions;

-- Private bucket for invoice photos/PDFs (§5.2 step 2). Object paths are
-- `{org_id}/{invoice_id}.{ext}` — the leading segment is what the RLS
-- policies below check against current_org_id(), per the note left in
-- 008_rls_policies.sql.
insert into storage.buckets (id, name, public)
values ('invoices', 'invoices', false)
on conflict (id) do nothing;

create policy "org members can read their invoice files"
  on storage.objects for select
  using (bucket_id = 'invoices' and (storage.foldername(name))[1] = current_org_id()::text);

create policy "org members can upload their invoice files"
  on storage.objects for insert
  with check (bucket_id = 'invoices' and (storage.foldername(name))[1] = current_org_id()::text);

create policy "org members can update their invoice files"
  on storage.objects for update
  using (bucket_id = 'invoices' and (storage.foldername(name))[1] = current_org_id()::text)
  with check (bucket_id = 'invoices' and (storage.foldername(name))[1] = current_org_id()::text);

create policy "org members can delete their invoice files"
  on storage.objects for delete
  using (bucket_id = 'invoices' and (storage.foldername(name))[1] = current_org_id()::text);
