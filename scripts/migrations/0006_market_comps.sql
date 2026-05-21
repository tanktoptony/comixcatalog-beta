-- 0006_market_comps.sql
--
-- Phase 2 — Valuation pipeline foundation.
--
-- This migration:
--   1. Creates `market_comps` — the raw sold-listing snapshot table that eBay
--      Browse API (and later Heritage Auctions, etc.) writes into.
--   2. Adds three derived columns to `user_collections`:
--        auto_market_value      — most-recent computed value from comps
--        auto_market_value_at   — when that value was computed
--        auto_market_value_n    — sample size that fed the median
--      The existing `market_value` column stays as the user-entered override.
--      The library UI shows `auto_market_value` when present, with `market_value`
--      as a manual override.
--
-- Why a separate comp table, not denormalizing onto gcd_issues:
--   - gcd_issues is read-mostly (2.5M rows, rarely updated). market_comps is
--     write-heavy (refreshed per issue weekly). Co-locating would block ingest
--     on gcd_issues update locks.
--   - We don't always have a gcd_issue_id (eBay listings for foreign or
--     unindexed issues). Looser join lets us still capture the data.
--
-- Idempotent on re-run — uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- market_comps — one row per sold listing.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.market_comps (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Issue linkage. Nullable because eBay titles don't always match a known
  -- gcd_issue cleanly — we still want to capture the row, with a human
  -- review queue elsewhere.
  gcd_issue_id          integer,

  -- Grade signal. We store both the bucket (normalized for lookup) and the
  -- raw values it was derived from. Bucket examples: "CGC 9.8", "Raw NM",
  -- "Slabbed Other", "Raw Ungraded".
  grade_bucket          text NOT NULL,
  slab_company          text,
  grade_numeric         numeric(3,1),
  condition_label       text,

  -- The actual comp data.
  sold_price            numeric(10,2) NOT NULL,
  sold_currency         text NOT NULL DEFAULT 'USD',
  sold_date             date NOT NULL,

  -- Source provenance. (source, external_listing_id) is the dedup key.
  source                text NOT NULL,
  external_listing_id   text NOT NULL,
  listing_url           text,
  listing_title         text,

  -- Bookkeeping.
  fetched_at            timestamptz NOT NULL DEFAULT now(),
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- Dedup: each (source, listing_id) pair should appear once. Re-fetching the
-- same eBay listing UPSERTs rather than duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS market_comps_source_listing_idx
  ON public.market_comps (source, external_listing_id);

-- The hot read path: "median sold price for gcd_issue X in grade_bucket Y,
-- last 90 days." Index supports both the WHERE and the ORDER BY.
CREATE INDEX IF NOT EXISTS market_comps_issue_bucket_date_idx
  ON public.market_comps (gcd_issue_id, grade_bucket, sold_date DESC);

-- For analytics + the unmatched-listing review queue.
CREATE INDEX IF NOT EXISTS market_comps_source_date_idx
  ON public.market_comps (source, sold_date DESC);

COMMENT ON TABLE public.market_comps IS
  'Sold-listing snapshots fueling auto-valuation. Populated by eBay Browse API + future sources.';

COMMENT ON COLUMN public.market_comps.grade_bucket IS
  'Normalized grade for lookup. Examples: "CGC 9.8", "Raw NM", "Slabbed Other".';

COMMENT ON COLUMN public.market_comps.gcd_issue_id IS
  'Loose link — nullable because eBay listing titles do not always match a known issue.';

-- ─────────────────────────────────────────────────────────────────────────
-- user_collections — derived auto-valuation columns.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.user_collections
  ADD COLUMN IF NOT EXISTS auto_market_value      numeric(10,2),
  ADD COLUMN IF NOT EXISTS auto_market_value_at   timestamptz,
  ADD COLUMN IF NOT EXISTS auto_market_value_n    integer;

COMMENT ON COLUMN public.user_collections.auto_market_value IS
  'Most-recent median sold price computed from market_comps for this issue + grade. User-entered market_value overrides this in UI display.';

COMMENT ON COLUMN public.user_collections.auto_market_value_n IS
  'Sample size that fed auto_market_value. UI surfaces this so users can judge confidence.';

COMMIT;
