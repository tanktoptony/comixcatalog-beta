-- 0101: partial index for the variant repair pass in gcd-issue-refresh.
--
-- refreshGcdIssuesFromApi.js --repair-variants pages through gcd_issues where
-- base_gcd_issue_id is null, ordered by gcd_id desc. That is 2,731 of ~2.49M
-- rows (2026-11-09), but the planner estimated ~40k and walked the whole
-- gcd_id index backwards, filtering out 1.47M rows for the second page: 11.5 s
-- against the API's 8 s statement timeout (57014). The job failed about two
-- runs in three since 2026-11-04 and passed only when the pages were cached.
create index concurrently if not exists gcd_issues_unrepaired_variants_idx
  on public.gcd_issues (gcd_id desc)
  where base_gcd_issue_id is null;

-- Rollback:
-- drop index concurrently if exists public.gcd_issues_unrepaired_variants_idx;
