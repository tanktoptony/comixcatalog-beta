-- 0007_story_arcs.sql
--
-- Phase 3 — Story arc completion intelligence ("you own X of Y issues in
-- this arc, here's what's missing").
--
-- ComicVine treats story arcs as a first-class resource (4045-<id>). An arc
-- like "X-Cutioner's Song" (4045-42178) spans 4 series (Uncanny X-Men, X-Men,
-- X-Factor, X-Force) and 14 issues. This migration adds the schema to track
-- arc composition and resolve each arc's issues back to our `gcd_issues` so
-- completion queries become a cheap join against `user_collections`.
--
-- Idempotent on re-run — uses IF NOT EXISTS throughout.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- story_arcs — one row per ComicVine arc.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.story_arcs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ComicVine identity. cv_id is the only stable external key — slugs and
  -- names change, ids don't.
  cv_id             integer UNIQUE NOT NULL,

  name              text NOT NULL,
  deck              text,           -- short subtitle
  description       text,           -- long HTML description

  -- Publisher attribution. Stored as text snapshot (not FK) — arcs from
  -- defunct publishers shouldn't break referential integrity.
  publisher_name    text,
  cv_publisher_id   integer,

  -- Cover/header image for the arc. Stored as a remote URL on CV; we don't
  -- mirror these to storage unless we decide to later.
  image_url         text,

  -- ComicVine's reported issue count. May disagree with our actual joined
  -- row count once parsing/matching has run — keep both.
  cv_count_issues   integer,

  fetched_at        timestamptz,    -- last successful refresh from CV
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_story_arcs_cv_id ON public.story_arcs(cv_id);
CREATE INDEX IF NOT EXISTS idx_story_arcs_publisher
  ON public.story_arcs(publisher_name)
  WHERE publisher_name IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────
-- story_arc_issues — many-to-many between arcs and issues.
-- ─────────────────────────────────────────────────────────────────────────
-- ComicVine arc.issues[] gives us a list of CV issue ids. We try to resolve
-- each to a local gcd_issues.gcd_id at ingest time (via canonical_covers
-- when present, otherwise by parsing the site_detail_url slug). Resolution
-- is BEST-EFFORT — gcd_issue_id stays NULL when we can't match, which is
-- fine for the listing surface (we still display the issue) and just means
-- ownership can't be computed for that row until a later backfill catches it.
CREATE TABLE IF NOT EXISTS public.story_arc_issues (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_arc_id     uuid NOT NULL REFERENCES public.story_arcs(id) ON DELETE CASCADE,

  -- ComicVine snapshot of the issue.
  cv_issue_id      integer NOT NULL,
  cv_issue_name    text,
  cv_site_url      text,

  -- Best-effort resolution to our local catalog.
  gcd_issue_id     integer,
  series_title     text,    -- parsed from cv_site_url slug
  issue_number     text,    -- parsed from cv_site_url slug

  -- Display ordering within the arc. Story arcs span multiple series and
  -- the chronology only makes sense as the arc's own sequence; we store
  -- the CV array index as a starting hint, with manual curation possible
  -- later if we want to surface a "reading order" feature.
  sort_order       integer,

  created_at       timestamptz NOT NULL DEFAULT now(),

  -- Same arc shouldn't list the same CV issue twice.
  UNIQUE (story_arc_id, cv_issue_id)
);

-- The two hot-path indexes:
--   (1) "show me this arc's issues" → scan by story_arc_id
--   (2) "what arcs does this issue belong to" → lookup by gcd_issue_id
CREATE INDEX IF NOT EXISTS idx_sai_arc
  ON public.story_arc_issues(story_arc_id);
CREATE INDEX IF NOT EXISTS idx_sai_gcd_issue
  ON public.story_arc_issues(gcd_issue_id)
  WHERE gcd_issue_id IS NOT NULL;

-- Refetching the same CV issue id is normal during refreshes — index it for
-- the upsert path that resolves matched/unmatched issues.
CREATE INDEX IF NOT EXISTS idx_sai_cv_issue
  ON public.story_arc_issues(cv_issue_id);

COMMIT;
