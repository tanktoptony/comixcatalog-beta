-- Tier 1 profile fields: bio, display_name, location, website, per-section privacy.
-- Run in the Supabase SQL editor. Idempotent — safe to re-run.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS display_name   TEXT,
  ADD COLUMN IF NOT EXISTS location       TEXT,
  ADD COLUMN IF NOT EXISTS bio            TEXT,
  ADD COLUMN IF NOT EXISTS website_url    TEXT,
  ADD COLUMN IF NOT EXISTS show_collection BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS show_wantlist   BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS show_for_sale   BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS show_value      BOOLEAN NOT NULL DEFAULT TRUE;

-- Storage bucket for user avatars. Public read, authenticated write.
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', TRUE)
ON CONFLICT (id) DO NOTHING;

-- RLS policies on storage.objects for the avatars bucket.
-- Each user can only write to their own folder: avatars/<user_id>/...

DROP POLICY IF EXISTS "avatars public read" ON storage.objects;
CREATE POLICY "avatars public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars owner write" ON storage.objects;
CREATE POLICY "avatars owner write"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "avatars owner update" ON storage.objects;
CREATE POLICY "avatars owner update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "avatars owner delete" ON storage.objects;
CREATE POLICY "avatars owner delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
