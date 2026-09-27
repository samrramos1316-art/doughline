-- Lines saved in one batch (a scan, or a paste into the manual-entry grid)
-- share a created_at, so ordering by it alone shuffles them. position is the
-- line's place in its batch: order by (created_at, position) to show lines
-- the way they were printed or typed.
alter table invoice_line_items add column position integer;
