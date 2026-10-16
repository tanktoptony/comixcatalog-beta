-- 0077: gcd_series.publication_type (GCD: magazine | book | album), filled by
-- scripts/backfillSeriesFormatFromDump.js. APPLIED IN PROD 2026-10-16.

alter table public.gcd_series add column if not exists publication_type text;

-- Rollback:
-- alter table public.gcd_series drop column if exists publication_type;
