-- 0022 — pin series.comicvine_volume_id so cover ingest stops re-guessing.
--
-- Why this exists:
-- GCD frequently carries MANY distinct series entries sharing an identical
-- title — foreign-language reprints, book-club editions, unrelated one-shots
-- ("Ultimate Spider-Man" alone has 30 separate gcd_series rows under Marvel
-- Comics). comicvine_api_to_supabase.py resolves a target's ComicVine volume
-- by title/publisher/year search on every run, with no memory of which
-- volume was confirmed correct last time. Because GCD's duplicate entries
-- make the "which of our series does this cover belong to" step ambiguous,
-- repeat ingest runs can drift to a DIFFERENT (wrong) gcd_id each time even
-- though ComicVine's own volume match stays consistent — confirmed live
-- 2026-08-25 across Excalibur, Batman, Catwoman, Nightwing, Invincible, and
-- dozens more (see docs/cover-ingestion-audit-findings.md and project
-- memory for the full incident list). Each incident so far required a
-- manual or scripted after-the-fact repair.
--
-- The fix: once a series' correct ComicVine volume is confirmed (via the
-- overlap-scoring logic in scripts/repairFeaturedSeriesCoverage.js /
-- scripts/propagateGcdIdByCvVolume.js, or a clean initial ingest), pin it
-- here permanently. Future ingest runs check this column FIRST and skip
-- the fuzzy title search entirely when it's set — "resolve once, ingest
-- against the pin forever after" instead of re-deriving the mapping (and
-- risking a wrong answer) every single run.
--
-- After this migration:
--   1. Run scripts/backfillSeriesComicvineVolumeId.js to populate the
--      column for series that already have consistently-tagged covers.
--   2. comicvine_api_to_supabase.py checks series.comicvine_volume_id
--      before falling back to find_volume()'s title/publisher/year search.
--   3. Any future manual relink (propagateGcdIdByCvVolume.js,
--      repairFeaturedSeriesCoverage.js) should also update this column for
--      the series it touches, so the pin never goes stale relative to
--      canonical_covers.

ALTER TABLE series
  ADD COLUMN IF NOT EXISTS comicvine_volume_id INTEGER;

CREATE INDEX IF NOT EXISTS series_comicvine_volume_id_idx
  ON series (comicvine_volume_id)
  WHERE comicvine_volume_id IS NOT NULL;
