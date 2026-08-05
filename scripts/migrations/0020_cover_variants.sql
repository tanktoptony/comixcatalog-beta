CREATE TABLE cover_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_cover_id UUID NOT NULL REFERENCES canonical_covers(id),
  gcd_issue_id INTEGER,
  source TEXT NOT NULL DEFAULT 'comicvine',
  source_image_id TEXT NOT NULL,
  original_url TEXT NOT NULL,
  storage_path TEXT,
  caption TEXT,
  image_tags TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source, source_image_id)
);
CREATE INDEX idx_cover_variants_canonical_cover ON cover_variants(canonical_cover_id);
CREATE INDEX idx_cover_variants_gcd_issue ON cover_variants(gcd_issue_id);
