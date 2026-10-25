-- 0088: index gcd_issues.key_date for the new-release cover queue.
--
-- scripts/generateNewReleaseGap.js runs before every hourly cover ingest and
-- asks for the issues GCD dates in the last few weeks. Without this index that
-- is a sequential scan of ~2.5M rows each hour (Disk IO budget, 2026-10-05).
-- key_date is GCD's 'YYYY-MM-DD' text, which sorts correctly as text.
create index concurrently if not exists gcd_issues_key_date_idx
  on public.gcd_issues (key_date);

-- Rollback:
-- drop index concurrently if exists public.gcd_issues_key_date_idx;
