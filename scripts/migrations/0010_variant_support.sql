-- Migration 0010: variant + multi-copy support on user_collections.
--
-- BEFORE: one row per (user_id, gcd_issue_id|comic_id) was the de-facto rule.
-- The UI deduped on add; collectors couldn't track multiple copies of the
-- same issue (8 copies = 4 variants x 2 each is a real pattern).
--
-- AFTER: rows are addressed by uuid id only; collectors can have N rows
-- per (user, issue). variant_label/copy_number distinguish them in the UI.
-- variant_of_gcd_id is a forward hook for when we have a clean variant
-- data source (CV doesn't model variants cleanly; GCD does but our mirror
-- doesn't have the variant_of fields populated yet).

ALTER TABLE user_collections
  ADD COLUMN IF NOT EXISTS variant_label TEXT,
  ADD COLUMN IF NOT EXISTS copy_number   INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS variant_of_gcd_id INTEGER;

COMMENT ON COLUMN user_collections.variant_label IS
  'Freeform variant tag entered by the collector — "Newsstand", "Direct Edition", "Cover B", "1:25 Incentive", etc. Until we ingest a proper variant source, this is user-typed.';

COMMENT ON COLUMN user_collections.copy_number IS
  'When the collector owns multiple copies of the same (issue, variant), this distinguishes them. Defaults to 1; multi-copy collectors set 2, 3, ... per added copy.';

COMMENT ON COLUMN user_collections.variant_of_gcd_id IS
  'Forward-compatible link to a base gcd_issue when GCD models the variant as its own gcd_issue. Populated by future variant-ingest pipeline (Phase 3).';

-- Index for grouping copies by issue within a user's collection — used by
-- the library page to show "Copy 1, Copy 2..." stacks under each issue.
CREATE INDEX IF NOT EXISTS idx_user_collections_grouping
  ON user_collections (user_id, gcd_issue_id, variant_label, copy_number);
