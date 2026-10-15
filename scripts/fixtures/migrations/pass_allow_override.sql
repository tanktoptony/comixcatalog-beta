-- Rollback: restore the old column type and drop the index.
-- migration-check: allow maintenance window approved for this rewrite
create index idx_listings_price on listings (price);
alter table listings alter column price type numeric(12, 2);
