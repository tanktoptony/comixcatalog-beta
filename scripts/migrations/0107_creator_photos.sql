-- 0107_creator_photos.sql
--
-- Free-licensed creator photos matched by exact GCD creator id through
-- Wikidata, with the Commons attribution needed to display each image.
--
-- Rollback:
--   alter table public.creators
--     drop column if exists photo_url,
--     drop column if exists photo_page_url,
--     drop column if exists photo_credit,
--     drop column if exists photo_license,
--     drop column if exists photo_synced_at;

begin;

alter table public.creators
  add column if not exists photo_url text,
  add column if not exists photo_page_url text,
  add column if not exists photo_credit text,
  add column if not exists photo_license text,
  add column if not exists photo_synced_at timestamptz;

commit;
