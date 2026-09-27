set search_path to "$user", public, extensions;

-- The vision model's plain-English name for each line ("BUTTER SWT UNSLTD
-- 36/1#" -> "unsalted sweet butter"). It's what the line's embedding is
-- computed from (raw distributor shorthand embeds too poorly to match on),
-- and the swipe UI shows it so the owner sees what the scan understood.
-- raw_text stays the verbatim print and the vendor_ingredient_aliases key.
alter table invoice_line_items add column parsed_item_name text;
