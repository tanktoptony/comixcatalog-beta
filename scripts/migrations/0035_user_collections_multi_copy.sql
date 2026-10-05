-- 0035_user_collections_multi_copy.sql
--
-- Let a collector own several copies of one GCD issue (Tony, 2026-10-05).
-- Until now user_collections_user_gcd_issue_unique allowed one row per
-- (user, gcd_issue_id), so "Add another copy" always failed with 23505.
--
-- After this:
--   - owned / for_sale rows for an issue: any number (one row = one copy)
--   - wishlist rows for an issue: at most one (new partial unique index)
--   - local comics (comic_id) stay one row each; the (user_id, comic_id)
--     constraint was declared twice under two names, so one copy is dropped.
--
-- Checked before writing (2026-10-05): 0 issues with multiple rows, 0
-- duplicate wishlist pairs, so the new index builds without conflicts.
-- user_collections is small; a plain (non-concurrent) build is quick.

begin;

drop index if exists public.user_collections_user_gcd_issue_unique;

create unique index if not exists user_collections_one_wishlist_per_issue
  on public.user_collections (user_id, gcd_issue_id)
  where status = 'wishlist' and gcd_issue_id is not null;

alter table public.user_collections drop constraint if exists unique_user_comic;

commit;

-- Rollback (only works while no user has 2+ rows for one issue):
--   begin;
--   drop index if exists public.user_collections_one_wishlist_per_issue;
--   create unique index user_collections_user_gcd_issue_unique
--     on public.user_collections (user_id, gcd_issue_id) where gcd_issue_id is not null;
--   alter table public.user_collections add constraint unique_user_comic unique (user_id, comic_id);
--   commit;
