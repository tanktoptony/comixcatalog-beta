-- One source-of-truth catalog row for a GCD issue/barcode pair. Keep this
-- partial: collectors may independently submit the same UPC for review, and
-- the backfill must never update or delete those pending reports.
create unique index if not exists issue_printings_catalog_upc_unique
  on issue_printings (gcd_issue_id, upc)
  where submitted_by is null and status = 'accepted' and upc is not null;
