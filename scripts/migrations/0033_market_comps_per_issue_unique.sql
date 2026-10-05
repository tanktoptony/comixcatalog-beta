-- 0033_market_comps_per_issue_unique.sql
--
-- One eBay listing can be a comp for more than one catalog issue: GCD carries
-- near-duplicate series, and a listing for Marvel Super-Heroes Secret Wars #8
-- (1984) also matches "Marvel Super Heroes Secret Wars" (1985) #8. With the
-- unique key on (source, external_listing_id) alone, every fetch moved the row
-- to whichever issue was processed last. Measured 2026-10-05: the 1985
-- duplicate held 30 comps for that book and the real 1984 issue held 2, so
-- the real one showed no value.
--
-- Key each comp on the issue too. Existing rows already satisfy the new index
-- (the old one was stricter).
--
-- Order: run this, then merge the PR that changes fetchEbayComps.js's
-- onConflict to "source,external_listing_id,gcd_issue_id". Between the two,
-- the daily eBay job (05:00 UTC) would fail its upserts, so do them together.
--
-- Rollback (only valid before any listing is stored under two issues):
--   create unique index market_comps_source_listing_idx
--     on public.market_comps (source, external_listing_id);
--   drop index public.market_comps_source_listing_issue_idx;

begin;

create unique index if not exists market_comps_source_listing_issue_idx
  on public.market_comps (source, external_listing_id, gcd_issue_id);

drop index if exists public.market_comps_source_listing_idx;

commit;
