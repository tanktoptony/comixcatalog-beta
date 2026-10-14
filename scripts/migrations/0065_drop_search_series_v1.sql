-- Drop search_series_by_relevance (v1, last defined in 0041).
--
-- Replaced by search_series_by_relevance_v2 (0064) on 2026-10-13: same rows
-- and order, but index lookups instead of a full scan of ~209k series. After
-- PR #314 the app reached v1 only as a fallback when v2 was missing; the
-- cleanup PR removed that fallback, the ops script and the verify SQL now use
-- v2, and no database function calls v1. Apply after the cleanup PR deploys.

drop function if exists public.search_series_by_relevance(text, text[], int);

notify pgrst, 'reload schema';

-- Rollback: re-run the function definition in
-- scripts/migrations/0041_series_search_fuzzy_only_when_empty.sql.
