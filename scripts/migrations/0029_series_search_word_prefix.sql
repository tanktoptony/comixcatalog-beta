-- 0029 — search_series_by_relevance(): rank a title whose FIRST WORD is the
-- query above one that merely starts with the same letters.
--
-- Third pass at the class of bug 0023 and 0024 chased: a relevant series
-- ranked below an irrelevant one because the ordering keyed on something
-- other than relevance. 0023 moved it off issue_count_cached, 0024 moved it
-- off raw similarity(), this moves it off bare title length.
--
-- Found live 2026-09-24 while logging a Valiant long box. Under 0024, "rai":
--
--   rai                        exact                        1000
--   rai companion              600 - (12-3)                  591
--   rain like hammers          600 - (15-3)                  588
--   raiders of the lost ark    600 - (20-3)                  583
--   rai and the future force   600 - (20-3)                  583
--
-- "Rai and the Future Force" is a real Valiant run, fully catalogued, 15
-- issues, every cover present — and it ranked 19th among allowlisted
-- candidates, below Raiders of the Lost Ark and Rainbow Brite, so the API's
-- result limit cut it off. Searching "rai" made a complete series look
-- missing, which is the worst failure mode for someone logging a collection.
--
-- Cause: 0024's prefix tier cannot tell the query being a WHOLE WORD from
-- the query being the first letters of a longer word ("rain", "raiders").
-- Both take the 600 tier, and then title length alone decides — which
-- systematically punishes multi-word titles, exactly the titles a word match
-- is most likely to be.
--
-- WHY THE TEST USES lower(s.title) AND NOT title_normalized:
-- title_normalized strips spaces as well as punctuation, so
-- "Rai and the Future Force" is stored as "raiandthefutureforce". There is
-- no word boundary left in it to anchor on. A first attempt at this
-- migration tested title_normalized LIKE term || ' %' and changed precisely
-- nothing, because that pattern can never match. The raw title is the only
-- column that still knows where the words are.
--
-- The regex is safe to build by concatenation: normalizeSearch() in
-- src/app/api/search/series/route.js reduces the query to [a-z0-9] before it
-- is ever passed here, so normalized_term cannot carry a metacharacter.
--
-- WHY THE NEW TIER IS FLAT (800) RATHER THAN LENGTH-PENALISED:
-- Every title in it begins with the query as a complete word, so they are
-- all strongly relevant and length says little. Issue count says more: it
-- puts a 15-issue run above a 1-issue companion one-shot. With a length
-- penalty instead, Future Force still landed 12th, behind three one-shots,
-- and would still have been near the display cut. Flat plus issue_count
-- puts it 9th, immediately after the eight "Rai" volumes.
--
-- Measured against the live allowlisted candidate set, old vs new rank:
--
--   rai      -> Rai and the Future Force      19 -> 9
--   batman   -> Batman: The Long Halloween   325 -> 93
--   xmen     -> X-Men                          1 -> 1
--   saga     -> Saga                           1 -> 1
--   spiderman-> The Amazing Spider-Man       294 -> 294
--   hulk     -> The Incredible Hulk          120 -> 120
--
-- No query tested got worse. Still open and NOT addressed here: a query that
-- matches a later word ("hulk" against "The Incredible Hulk") stays in the
-- bottom tier, because a leading article pushes the real title out of first
-- position. That wants its own fix.
--
-- To apply: paste into the Supabase SQL editor and run, same as 0023/0024.

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
      -- The whole title is the query.
      WHEN s.title_normalized = normalized_term THEN 1000
      -- The query is the title's entire first word. Matches "Rai and the
      -- Future Force" and "Rai: The History of..." for "rai", but not
      -- "Rain Like Hammers" or "Raiders of the Lost Ark". The character
      -- class is what separates a word from a fragment.
      WHEN lower(s.title) ~ ('^' || normalized_term || '[^a-z0-9]') THEN 800
      -- The query is a leading fragment of the first word.
      WHEN s.title_normalized LIKE normalized_term || '%'
        THEN 600 - LEAST(300, length(s.title_normalized) - length(normalized_term))
      -- The query appears somewhere else in the title.
      ELSE 250 - LEAST(200, length(s.title_normalized) - length(normalized_term))
    END DESC,
    s.issue_count_cached DESC
  LIMIT result_limit;
$$;
