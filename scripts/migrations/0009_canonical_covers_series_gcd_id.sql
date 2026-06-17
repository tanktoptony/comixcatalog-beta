-- 0009 — add canonical_covers.series_gcd_id for ID-based cover joins.
--
-- Why this exists:
-- library-hydrate, public-profile, story-arc, issue, and series routes all
-- join canonical_covers to gcd_issues via the series_title string. That
-- match is fragile against mojibake (24k+ rows in series have U+FFFD from
-- old encoding bugs), curly quotes vs straight, trailing punctuation, and
-- any future title cleanup work. A single typo in one row's title cascades
-- into every user seeing a broken cover.
--
-- The fix: store the gcd_series ID alongside the title. Joins prefer the
-- integer ID; title-string matching becomes a fallback for legacy rows that
-- weren't backfilled.
--
-- After this migration:
--   1. Run scripts/backfillCanonicalCoversGcdId.js to populate the column
--      for existing rows.
--   2. The ingester (comicvine_api_to_supabase.py) writes this column on
--      every new insert.
--   3. library-hydrate and friends prefer series_gcd_id when set, fall back
--      to series_title when null.

ALTER TABLE canonical_covers
  ADD COLUMN IF NOT EXISTS series_gcd_id INTEGER;

-- Hot path: (series_gcd_id, issue_number) is how library-hydrate looks up
-- "what's the cover for this user's library row?" Add a partial index so we
-- only index rows that have the id set — backfill will fill the rest in.
CREATE INDEX IF NOT EXISTS canonical_covers_series_gcd_id_issue_idx
  ON canonical_covers (series_gcd_id, issue_number)
  WHERE series_gcd_id IS NOT NULL;
