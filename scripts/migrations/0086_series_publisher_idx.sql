-- Publisher pages (/publisher/[slug]) list a publisher's US-market series by
-- issue count and by start year. Without this they scan all of series.
-- Run on its own (CONCURRENTLY cannot run inside a transaction, and a
-- non-concurrent build would block writes to series).
create index concurrently if not exists series_publisher_us_idx
  on public.series (resolved_publisher_cached, issue_count_cached desc)
  where us_market is true;

-- Rollback:
-- drop index concurrently if exists public.series_publisher_us_idx;
