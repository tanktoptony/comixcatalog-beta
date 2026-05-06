-- Clean up the Donald Duck mis-ingest from volume_id 2090.
-- Same pattern as 0003 — this happened because --volume-id mode trusts the
-- caller blindly, and 2090 was guessed (incorrectly) as Uncanny X-Men.
--
-- Run in Supabase SQL editor.

-- 1) Inspect what's in there
SELECT count(*) AS bad_rows
FROM canonical_covers
WHERE comicvine_volume_id = 2090;

SELECT issue_number, series_title, publisher, series_year
FROM canonical_covers
WHERE comicvine_volume_id = 2090
ORDER BY issue_number
LIMIT 10;

-- 2) Delete (uncomment after confirming the SELECTs above show Donald Duck)
DELETE FROM canonical_covers
WHERE comicvine_volume_id = 2090;
