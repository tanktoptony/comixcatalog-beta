-- 0105_pricecharting_prices.sql
--
-- PriceCharting's comic price guide, one row per PriceCharting product that
-- links to a GCD issue. Filled daily by scripts/fetchPriceCharting.js from the
-- Legendary subscription's comics CSV.
--
-- Prices are integer cents keyed by grade label, from PriceCharting's comic
-- key table: {"ungraded": 10840, "2.0": 4500, ..., "9.8": 53999, "10.0": 70200}.
-- PriceCharting builds these from sold listings, so unlike market_comps
-- ('ebay-listed' asking prices) they are sale-based guide values.
--
-- Terms: shown in the product under PriceCharting's written OK (2026-11-10)
-- while revenue is under $1,000/mo, with a citation linking to
-- https://www.pricecharting.com/game/<pc_id> wherever a price shows. All rows
-- must be deleted if the subscription ends.
--
-- RLS on with no policies: only the service role reads or writes. Pages read
-- it server-side, so the whole guide is never exposed through the public
-- REST endpoint.
--
-- Rollback:
--   drop table if exists public.pricecharting_prices;

begin;

create table if not exists public.pricecharting_prices (
  pc_id         bigint primary key,
  gcd_issue_id  integer not null,
  product_name  text not null,
  console_name  text not null,
  release_date  date,
  prices        jsonb not null default '{}'::jsonb,
  sales_volume  integer,
  match_method  text not null,
  row_hash      text not null,
  updated_at    timestamptz not null default now()
);

create index if not exists pricecharting_prices_gcd_issue_idx
  on public.pricecharting_prices (gcd_issue_id);

alter table public.pricecharting_prices enable row level security;

comment on table public.pricecharting_prices is
  'PriceCharting comic guide values linked to GCD issues. Cite and link https://www.pricecharting.com/game/<pc_id> wherever shown. Purge if the subscription ends.';

commit;
