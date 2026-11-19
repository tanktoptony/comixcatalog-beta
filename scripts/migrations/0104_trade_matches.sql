-- Trade matches: match a collector's wantlist against other visible shelves.
-- The function returns one row per member with arrays of base GCD issue ids.

alter table public.user_collections
  add column if not exists open_to_trade boolean not null default false;

-- Existing indexes (user_collections_gcd_issue_id_idx, user_collections_owned_by_user_idx,
-- user_collections_one_wishlist_per_issue) cover these lookups at current size.

create or replace function public.social_trade_matches(p_user uuid)
returns table (
  member_id uuid,
  username text,
  they_have bigint[],
  you_have bigint[],
  they_have_trade bigint[],
  score int
)
language sql
stable
security definer
set search_path = public
as $$
  with collection_base as (
    select
      uc.user_id,
      uc.status,
      uc.open_to_trade,
      coalesce(gi.base_gcd_issue_id, uc.gcd_issue_id)::bigint as base_id
    from public.user_collections uc
    join public.gcd_issues gi on gi.gcd_id = uc.gcd_issue_id
    where uc.gcd_issue_id is not null
  ),
  me_want as (
    select distinct base_id from collection_base
    where user_id = p_user and status = 'wishlist'
  ),
  me_own as (
    select distinct base_id from collection_base
    where user_id = p_user and status in ('owned', 'for_sale')
  ),
  eligible as (
    select p.id, p.username, p.show_collection, p.show_wantlist
    from public.profiles p
    where p.id <> p_user
      and p.username is not null
      and p.is_public is not false
      and lower(p.username) not in ('test_tony', 'test_tony_depaul', 'thrice347')
      and not exists (
        select 1 from public.user_blocks b
        where (b.blocker_id = p_user and b.blocked_id = p.id)
           or (b.blocker_id = p.id and b.blocked_id = p_user)
      )
  ),
  matched as (
    select
      e.id,
      e.username,
      coalesce(array_agg(distinct cb.base_id order by cb.base_id)
        filter (where e.show_collection is not false and cb.status in ('owned', 'for_sale')
          and mw.base_id is not null), '{}'::bigint[]) as they_have,
      coalesce(array_agg(distinct cb.base_id order by cb.base_id)
        filter (where e.show_wantlist is not false and cb.status = 'wishlist'
          and mo.base_id is not null), '{}'::bigint[]) as you_have,
      coalesce(array_agg(distinct cb.base_id order by cb.base_id)
        filter (where e.show_collection is not false and cb.status in ('owned', 'for_sale')
          and cb.open_to_trade and mw.base_id is not null), '{}'::bigint[]) as they_have_trade
    from eligible e
    join collection_base cb on cb.user_id = e.id
    left join me_want mw on mw.base_id = cb.base_id
    left join me_own mo on mo.base_id = cb.base_id
    group by e.id, e.username
  )
  select
    m.id,
    m.username,
    m.they_have,
    m.you_have,
    m.they_have_trade,
    ((case when cardinality(m.they_have) > 0 and cardinality(m.you_have) > 0 then 1000000 else 0 end)
      + cardinality(m.they_have_trade) * 1000
      + cardinality(m.they_have) + cardinality(m.you_have))::int as score
  from matched m
  where cardinality(m.they_have) > 0 or cardinality(m.you_have) > 0
  order by score desc, m.username
  limit 50
$$;

revoke all on function public.social_trade_matches(uuid) from public, anon, authenticated;
grant execute on function public.social_trade_matches(uuid) to service_role;

-- user_collections_sync_listing watches an explicit column list that does
-- not include open_to_trade, so changing this flag does not affect listings.

-- Rollback:
--   drop function if exists public.social_trade_matches(uuid);
--   alter table public.user_collections drop column if exists open_to_trade;
