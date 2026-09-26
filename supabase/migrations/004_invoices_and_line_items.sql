set search_path to "$user", public, extensions;

create table invoices (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references organizations(id) on delete cascade,
  vendor_id uuid references vendors(id),
  uploaded_by uuid references profiles(id),
  file_storage_path text not null, -- path in the Supabase Storage bucket
  file_type text not null default 'image', -- 'image' | 'pdf'
  source_type text not null default 'camera_scan',
    -- 'camera_scan' | 'bulk_upload' | 'manual_entry' — see §9.1
  status text not null default 'pending',
    -- 'pending' | 'processing' | 'needs_review' | 'completed' | 'failed'
    -- 'failed' = vision extraction could not parse the file at all; the invoice
    -- routes straight to the manual-entry grid (§9.2) instead of the swipe UI.
    -- An invoice may ONLY reach 'completed' when it has zero line items in
    -- ('pending', 'needs_review', 'new_ingredient') — see §6.3.
  raw_extraction jsonb, -- full raw JSON returned by the vision model, for audit/debugging
  invoice_number text,
  invoice_date date,
  total_amount numeric(12,2),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index invoices_org_id_idx on invoices(org_id, created_at desc);
create index invoices_status_idx on invoices(org_id, status);

alter table ingredient_price_history
  add constraint ingredient_price_history_invoice_fk
  foreign key (invoice_id) references invoices(id) on delete set null;

create table invoice_line_items (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references organizations(id) on delete cascade,
  invoice_id uuid not null references invoices(id) on delete cascade,
  raw_text text not null, -- exactly what the vision model read, e.g. "ORG CHKN BRST 40# CS"
  parsed_quantity numeric(12,4),
  parsed_unit text,
  parsed_unit_cost numeric(12,4),
  parsed_line_total numeric(12,2),
  embedding vector(1024), -- embedding of raw_text, computed at extraction time
  matched_ingredient_id uuid references ingredients(id),
  match_confidence numeric(4,3), -- 0.000–1.000 cosine similarity of the chosen match
  match_status text not null default 'pending',
    -- 'pending' | 'auto_matched' | 'needs_review' | 'confirmed' | 'rejected' | 'new_ingredient'
  candidate_matches jsonb, -- top-N {ingredient_id, name, similarity} shown in swipe-to-verify
  entry_method text not null default 'vision', -- 'vision' | 'manual' — see §9.2
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index invoice_line_items_invoice_idx on invoice_line_items(invoice_id);
create index invoice_line_items_org_status_idx
  on invoice_line_items(org_id, match_status);
create index invoice_line_items_embedding_hnsw_idx on invoice_line_items
  using hnsw (embedding vector_cosine_ops);
