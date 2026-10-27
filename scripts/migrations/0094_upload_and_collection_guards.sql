-- Abuse guards from the 2026-10-27 marketplace security audit.
--
-- 1. comic-covers is a public bucket, and its only insert policy let any
--    signed-in user upload any file of any type or size to any path. The one
--    client upload is GradeEditor's photo of the user's own copy at
--    library/<collection id>.<ext>; cover scan and admin review upload as the
--    service role, which skips these policies. Uploads are now limited to
--    that path for a copy the uploader owns, images only, 10 MB max. The
--    update policy lets a re-upload (GradeEditor uses upsert) replace the
--    same file, which the old insert-only policy refused.
-- 2. avatars already limits writes to the owner's folder; it now takes
--    images only, 5 MB max (largest today is 1.6 MB).
-- 3. user_collections had no size limit, and members can insert rows
--    straight through the REST API, so one account could add millions of
--    copies (each for-sale copy also makes a public listing). The cap is
--    50,000 copies per member; the largest collection today has 387.

begin;

update storage.buckets
set file_size_limit = 10485760,
    allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif','image/avif']
where id = 'comic-covers';

update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif']
where id = 'avatars';

drop policy if exists "Allow authenticated uploads 10mmp8u_0" on storage.objects;
drop policy if exists "comic-covers own copy upload" on storage.objects;
drop policy if exists "comic-covers own copy replace" on storage.objects;

create policy "comic-covers own copy upload" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'comic-covers'
  and name ~ '^library/[0-9a-f-]{36}\.[a-z0-9]{2,5}$'
  and exists (
    select 1 from public.user_collections uc
    where uc.user_id = auth.uid()
      and uc.id::text = split_part(storage.filename(name), '.', 1)
  )
);

create policy "comic-covers own copy replace" on storage.objects
for update to authenticated
using (
  bucket_id = 'comic-covers'
  and name ~ '^library/[0-9a-f-]{36}\.[a-z0-9]{2,5}$'
  and exists (
    select 1 from public.user_collections uc
    where uc.user_id = auth.uid()
      and uc.id::text = split_part(storage.filename(name), '.', 1)
  )
)
with check (
  bucket_id = 'comic-covers'
  and name ~ '^library/[0-9a-f-]{36}\.[a-z0-9]{2,5}$'
  and exists (
    select 1 from public.user_collections uc
    where uc.user_id = auth.uid()
      and uc.id::text = split_part(storage.filename(name), '.', 1)
  )
);

create or replace function public.user_collections_size_cap() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select distinct user_id from new_rows loop
    if (select count(*) from public.user_collections where user_id = r.user_id) > 50000 then
      raise exception 'Collection limit reached: 50,000 copies. Email comixcatalog@gmail.com to raise it.'
        using errcode = '54000';
    end if;
  end loop;
  return null;
end $$;

revoke all on function public.user_collections_size_cap() from public, anon, authenticated;

drop trigger if exists user_collections_size_cap on public.user_collections;
create trigger user_collections_size_cap
after insert on public.user_collections
referencing new table as new_rows
for each statement execute function public.user_collections_size_cap();

commit;

-- Rollback:
--   begin;
--   drop trigger if exists user_collections_size_cap on public.user_collections;
--   drop function if exists public.user_collections_size_cap();
--   drop policy if exists "comic-covers own copy upload" on storage.objects;
--   drop policy if exists "comic-covers own copy replace" on storage.objects;
--   create policy "Allow authenticated uploads 10mmp8u_0" on storage.objects for insert to authenticated with check (bucket_id = 'comic-covers');
--   update storage.buckets set file_size_limit = null, allowed_mime_types = null where id in ('comic-covers','avatars');
--   commit;
