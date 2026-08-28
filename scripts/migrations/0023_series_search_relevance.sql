-- 0023 — real relevance-ranked series search, backed by a trigram index.
--
-- Why this exists:
-- /api/search/series and /api/search/comics both search series.title_normalized
-- with `ILIKE '%term%'`, and series has ZERO indexes on that column. Every
-- search — every keystroke pause, site-wide — does a full sequential scan
-- of ~208,000 rows. Measured live 2026-08-28: an EXACT-match query
-- (`.eq("title_normalized", "theamazingspiderman")`) took 1.1 seconds.
-- That's the "slow, staggered loading" — it's a literal full-table scan on
-- every search, not a perception problem.
--
-- Worse than slow: the query orders by issue_count_cached DESC and cuts off
-- at a fixed row limit BEFORE the app ever gets to judge which result is
-- actually the best match. Confirmed live: searching "spiderman" silently
-- drops "The Amazing Spider-Man" (1983) and "Your Friendly Neighborhood
-- Spider-Man" (2025, currently on shelves) — real, exact-ish matches —
-- because 200+ unrelated one-shots/crossovers/reprints that also merely
-- CONTAIN "spiderman" outrank them by issue count and fill the truncation
-- window first. Same mechanism as the "17 distinct Justice League series"
-- and "Ultimate Spider-Man has 30 GCD entries" problems noted elsewhere in
-- this codebase — GCD's duplicate-title sprawl means "contains this
-- substring" is a huge, noisy candidate pool, and issue_count is the wrong
-- signal to rank it by before relevance is even considered.
--
-- The fix: rank by actual text relevance (pg_trgm similarity, with an exact
-- match forced to the top) IN THE DATABASE, before any limit is applied —
-- not by truncating on the wrong signal and hoping the right thing survives.
-- This needs a real index (trigram search on 208k rows is not fast without
-- one) and a function, since PostgREST can't express "ORDER BY a computed
-- relevance score" through its plain REST filters.
--
-- To apply: paste this whole file into the Supabase SQL editor and run it.
-- This repo has no automated migration runner — every prior migration here
-- was applied the same way. Safe to run more than once (everything is
-- CREATE ... IF NOT EXISTS / CREATE OR REPLACE).
--
-- After this migration, src/app/api/search/series/route.js and
-- src/app/api/search/comics/route.js call search_series_by_relevance()
-- instead of building their own ILIKE query, with a fallback to the old
-- query if the function isn't found yet — so shipping the app code doesn't
-- depend on this having run first, but search stays slow/truncated until
-- it has.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Trigram index: makes `title_normalized % term` (similarity) and
-- `ILIKE '%term%'` fast instead of a sequential scan.
CREATE INDEX IF NOT EXISTS series_title_normalized_trgm_idx
  ON series USING gin (title_normalized gin_trgm_ops);

-- Plain btree: makes exact-match and prefix-match (`term%`) fast — a GIN
-- trigram index can serve these too, but a btree is the right tool for
-- equality/prefix and was measured at 1.1s with no index of any kind.
CREATE INDEX IF NOT EXISTS series_title_normalized_btree_idx
  ON series (title_normalized);

-- search_series_by_relevance: the actual ranking fix. Returns candidates
-- ordered by (1) exact match, (2) trigram similarity to the query, (3)
-- issue_count_cached as a tiebreaker only — never as the primary signal.
-- Callers still do their own per-title-group dedup/volume-numbering on top
-- of this (see route.js) — this function's only job is "don't lose the
-- right answer before the app gets to see it."
CREATE OR REPLACE FUNCTION search_series_by_relevance(
  normalized_term text,
  allowed_publishers text[],
  result_limit int DEFAULT 400
)
RETURNS TABLE (
  id uuid,
  gcd_id integer,
  title text,
  issue_count_cached integer,
  year_start_cached integer,
  year_end_cached integer,
  resolved_publisher_cached text,
  featured_cover_path_cached text
)
LANGUAGE sql STABLE AS $$
  SELECT
    s.id,
    s.gcd_id,
    s.title,
    s.issue_count_cached,
    s.year_start_cached,
    s.year_end_cached,
    s.resolved_publisher_cached,
    s.featured_cover_path_cached
  FROM series s
  WHERE s.gcd_id IS NOT NULL
    AND s.issue_count_cached > 0
    AND s.year_start_cached IS NOT NULL
    AND s.resolved_publisher_cached = ANY(allowed_publishers)
    AND (
      s.title_normalized = normalized_term
      OR s.title_normalized ILIKE '%' || normalized_term || '%'
      OR s.title_normalized % normalized_term
    )
  ORDER BY
    (s.title_normalized = normalized_term) DESC,
    similarity(s.title_normalized, normalized_term) DESC,
    s.issue_count_cached DESC
  LIMIT result_limit;
$$;
