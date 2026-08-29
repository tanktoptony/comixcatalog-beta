-- 0025 — collection_value_history: the data plumbing for a value-over-time
-- graph on /library and /u/[username].
--
-- Why this exists: the "Collection Value" number on both pages is a single
-- point-in-time figure, recomputed live on every page load with no memory
-- of what it was yesterday or last month. A trend line needs a history to
-- draw, and there's no way to backfill one — the only way to have "value 30
-- days ago" thirty days from now is to start recording it today. This
-- migration just creates the table; scripts/snapshotCollectionValue.js
-- (run on a schedule via .github/workflows/snapshot-collection-value.yml)
-- is what actually populates it.
--
-- One row per (user, calendar day) — re-running the snapshot script the
-- same day upserts rather than duplicating, so an every-6-hours schedule
-- just keeps "today"'s row fresh instead of producing multiple points.
--
-- To apply: paste this whole file into the Supabase SQL editor and run it.
-- Safe to run more than once (CREATE TABLE IF NOT EXISTS / CREATE POLICY
-- guarded below).

CREATE TABLE IF NOT EXISTS collection_value_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL,
  total_value numeric(12,2) NOT NULL,
  owned_count integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS collection_value_history_user_date_idx
  ON collection_value_history (user_id, snapshot_date DESC);

ALTER TABLE collection_value_history ENABLE ROW LEVEL SECURITY;

-- Owner-only read for now. The snapshot script writes via the service-role
-- key, which bypasses RLS entirely, so no INSERT/UPDATE policy is needed
-- for that. If/when the value graph is added to the PUBLIC profile view
-- (not just the owner's own /library), revisit this to also allow reads
-- when profiles.is_public is true for that user — deliberately not done
-- here since that's a UI decision for the graph feature, not this table.
DROP POLICY IF EXISTS "Users can view their own value history" ON collection_value_history;
CREATE POLICY "Users can view their own value history"
  ON collection_value_history FOR SELECT
  USING (auth.uid() = user_id);
