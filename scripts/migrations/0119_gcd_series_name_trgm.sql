-- 0119_gcd_series_name_trgm.sql
-- Trigram index on gcd_series.name for the cover scan's series lookup.
--
-- POST /api/cover-scan adds GCD-only series to its candidates with one
-- `name ILIKE '%word%'` per title word (up to 8). gcd_series.name only had a
-- btree index, which can't serve a leading-wildcard ILIKE, so every scan
-- seq-scanned all ~218k rows: 180 ms for "amazing spider man", 200-550 ms
-- in the Supabase health check of 2026-11-23. A GIN trigram index serves all
-- of the ANDed ILIKE predicates in one bitmap scan, with no change to which
-- series match (a similarity() rewrite would change the results).
--
-- pg_trgm lives in the public schema here (same opclass as 0023/0038).

create index concurrently if not exists gcd_series_name_trgm_idx
  on public.gcd_series using gin (name gin_trgm_ops);

-- Rollback:
-- drop index concurrently if exists public.gcd_series_name_trgm_idx;
