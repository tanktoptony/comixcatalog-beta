-- Ranked collector suggestions without transferring collection rows to the app.
-- Only the service role can call this function because its viewer argument is
-- used to apply private follow and block exclusions.

begin;

create index if not exists user_collections_owned_by_user_idx
  on public.user_collections (user_id)
  where status in ('owned', 'for_sale');

create or replace function public.suggested_collectors(
  p_viewer_id uuid default null,
  p_limit integer default 24
)
returns table (
  id uuid,
  username text,
  display_name text,
  avatar_url text,
  is_founding_collector boolean,
  is_pro boolean,
  membership_tier text,
  owned_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
    p.username::text,
    p.display_name::text,
    p.avatar_url::text,
    coalesce(p.is_founding_collector, false),
    coalesce(p.is_pro, false),
    p.membership_tier::text,
    count(*) as owned_count
  from public.profiles p
  join public.user_collections uc
    on uc.user_id = p.id
   and uc.status in ('owned', 'for_sale')
  where p.is_public is not false
    and p.username is not null
    and (p_viewer_id is null or p.id <> p_viewer_id)
    and not exists (
      select 1
      from public.follows f
      where f.follower_id = p_viewer_id
        and f.followee_id = p.id
    )
    and not exists (
      select 1
      from public.user_blocks b
      where p_viewer_id is not null
        and ((b.blocker_id = p_viewer_id and b.blocked_id = p.id)
          or (b.blocker_id = p.id and b.blocked_id = p_viewer_id))
    )
  group by p.id, p.username, p.display_name, p.avatar_url,
    p.is_founding_collector, p.is_pro, p.membership_tier
  having count(*) >= 10
  order by coalesce(p.is_founding_collector, false) desc, count(*) desc, p.username asc
  limit least(greatest(coalesce(p_limit, 24), 1), 50);
$$;

revoke all on function public.suggested_collectors(uuid, integer) from public, anon, authenticated;
grant execute on function public.suggested_collectors(uuid, integer) to service_role;

commit;
