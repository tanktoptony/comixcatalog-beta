-- 0028: mirror GCD's publishing format onto gcd_series.
--
-- Why: GCD has separate series records for a run and for its collected
-- editions, both with the same name (e.g. "Fables" 10549 = the 2002-2024
-- ongoing, "Fables" 21639 = the trade paperbacks). Our mirror carried only
-- name/years/publisher, so nothing downstream could tell them apart: the
-- TPB series got pinned to the monthly's ComicVine volume, showed the
-- monthly's cover and issue count in search, and its issue pages borrowed
-- monthly covers by title match (found live 2026-09-21).
--
-- GCD's API exposes the answer directly:
--   publishing_format: "was ongoing series" | "collected edition" | "limited series" | ...
--   binding:           "saddle-stitched" | "trade paperback" | "hardcover" | ...
--   notes:             free text, for collected editions usually "Volume 1 -
--                      Legends in Exile collects Fables (DC, 2002 series) #1-5; ..."
--
-- Populated by scripts/syncGcdSeriesFormat.js (API, throttled, resumable).
-- Apply by hand in the Supabase SQL editor; there is no migration runner.

ALTER TABLE gcd_series
  ADD COLUMN IF NOT EXISTS publishing_format text,
  ADD COLUMN IF NOT EXISTS binding text,
  ADD COLUMN IF NOT EXISTS format_notes text,
  ADD COLUMN IF NOT EXISTS format_synced_at timestamptz;

-- The read paths filter on this ("is this series a collected edition?") and
-- the sync script selects unsynced rows by it, so both get an index.
CREATE INDEX IF NOT EXISTS gcd_series_publishing_format_idx
  ON gcd_series (publishing_format);
CREATE INDEX IF NOT EXISTS gcd_series_format_synced_at_idx
  ON gcd_series (format_synced_at);
