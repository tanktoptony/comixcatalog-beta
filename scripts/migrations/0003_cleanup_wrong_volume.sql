-- Clean up the Editorial Televisa "Uncanny X-Men" Spanish reprints that the
-- old find_volume() mis-ingested as if they were Marvel covers.
--
-- ComicVine volume_id 71565 = "Uncanny X-Men" by Editorial Televisa.
-- These rows pollute the (series_title, issue_number) join used by
-- /api/series/[id], showing wrong covers on the real Marvel run.
--
-- Run in Supabase SQL editor. Inspect first, then delete.

-- 1) Inspect: how many rows from this volume?
SELECT count(*) AS bad_rows
FROM canonical_covers
WHERE comicvine_volume_id = 71565;

-- 2) Optional: see a sample to confirm before deleting
SELECT issue_number, series_title, publisher, series_year, storage_path
FROM canonical_covers
WHERE comicvine_volume_id = 71565
ORDER BY issue_number
LIMIT 10;

-- 3) Delete the rows
DELETE FROM canonical_covers
WHERE comicvine_volume_id = 71565;

-- NOTE: this leaves orphan files in the canonical-covers storage bucket under
-- comicvine/uncanny-x-men/vol-71565/*. They're harmless (nothing references
-- them anymore) but you can clean them up via the Supabase Storage UI later.
