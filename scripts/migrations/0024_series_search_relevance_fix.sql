-- 0024 — fix search_series_by_relevance(): raw trigram similarity() was
-- itself a version of the same bug it was meant to fix, and slow.
--
-- Verified live right after 0023 was applied 2026-08-28:
--   - "The Amazing Spider-Man" (1983) now correctly surfaces for
--     "spiderman" — the core bug is fixed.
--   - "Your Friendly Neighborhood Spider-Man" (2025, 5 issues) still
--     didn't. It ranked 581st out of 748 candidates. Cause: similarity()
--     scores on the fraction of SHARED trigrams over TOTAL trigrams in
--     both strings — a long title like this one gets diluted purely by
--     being long, even though "spiderman" is a clean, real substring of
--     it. Same class of bug as before (relevant match outranked by
--     something ranked on the wrong signal), just moved from
--     issue_count_cached to raw similarity().
--   - The RPC call itself took ~3.1s, vs. 391ms for the same ILIKE
--     condition alone. The `title_normalized % normalized_term` trigram
--     operator in the WHERE clause is the likely cause — combined via OR
--     with two other conditions, the planner wasn't using the trgm index
--     cleanly for it.
--
-- Fix: drop the trigram `%` fuzzy-match clause (typo-tolerance is a nice
-- future enhancement, not needed for this bug, and was the slow part) and
-- replace similarity()-based ordering with the same bounded
-- length-difference scoring the app already used client-side for years
-- (see scoreSeriesTitle() in src/app/api/search/comics/route.js) — exact
-- match, then starts-with (penalized by length difference, capped at
-- -300), then contains (penalized by length difference, capped at -200).
-- A capped penalty means a long title with a real substring match still
-- ranks well; issue_count_cached is only the tiebreaker within a tier,
-- same as the original intent.
--
-- To apply: paste into the Supabase SQL editor and run, same as 0023.

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
    AND s.title_normalized ILIKE '%' || normalized_term || '%'
  ORDER BY
    CASE
      WHEN s.title_normalized = normalized_term THEN 1000
      WHEN s.title_normalized LIKE normalized_term || '%'
        THEN 600 - LEAST(300, length(s.title_normalized) - length(normalized_term))
      ELSE 250 - LEAST(200, length(s.title_normalized) - length(normalized_term))
    END DESC,
    s.issue_count_cached DESC
  LIMIT result_limit;
$$;
