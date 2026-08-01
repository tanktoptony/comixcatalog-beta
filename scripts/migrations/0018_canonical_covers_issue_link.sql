ALTER TABLE canonical_covers
  ADD COLUMN gcd_issue_id INTEGER,
  ADD COLUMN match_confidence TEXT DEFAULT 'unresolved';

CREATE INDEX idx_canonical_covers_gcd_issue
  ON canonical_covers(gcd_issue_id);
