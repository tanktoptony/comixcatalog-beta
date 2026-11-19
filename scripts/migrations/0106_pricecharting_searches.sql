-- 0106_pricecharting_searches.sql
--
-- PriceCharting offers no comics CSV (the Legendary download page lists video
-- games and card categories only), so scripts/fetchPriceCharting.js prices
-- comics through the API: one /api/products search per base GCD issue,
-- which returns the base book, newsstand and variants with full prices.
-- The API allows one call per second, so this ledger records when each base
-- issue was last searched and the daily job only re-searches stale ones.
--
-- Rollback:
--   drop table if exists public.pricecharting_searches;

begin;

create table if not exists public.pricecharting_searches (
  gcd_issue_id    integer primary key,
  searched_at     timestamptz not null default now(),
  products_found  integer not null default 0,
  linked          integer not null default 0
);

create index if not exists pricecharting_searches_searched_at_idx
  on public.pricecharting_searches (searched_at);

alter table public.pricecharting_searches enable row level security;

commit;
