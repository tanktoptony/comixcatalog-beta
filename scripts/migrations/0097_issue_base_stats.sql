begin;

-- Serves the issue-page community-count line with one primary-key lookup.
-- The nightly refresh reads user_collections by its user/status indexes and
-- marketplace_listings through that view's indexed source predicates.
create table public.issue_base_stats (
  base_gcd_issue_id bigint primary key,
  have integer not null default 0,
  want integer not null default 0,
  for_sale integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.issue_base_stats enable row level security;
revoke all on public.issue_base_stats from public, anon, authenticated;
grant select on public.issue_base_stats to service_role;

create or replace function public.refresh_issue_base_stats() returns integer
language plpgsql security definer set search_path = public as $$
declare refreshed integer;
begin
  create temporary table next_issue_base_stats on commit drop as
  with collection_bases as (
    select uc.user_id, uc.status, coalesce(gi.base_gcd_issue_id, uc.gcd_issue_id)::bigint as base_id
    from user_collections uc join profiles p on p.id = uc.user_id
    left join gcd_issues gi on gi.gcd_id = uc.gcd_issue_id
    where uc.gcd_issue_id is not null and p.is_public = true
  ), owned as (
    select cb.base_id, count(distinct cb.user_id)::integer as have
    from collection_bases cb join profiles p on p.id = cb.user_id
    where cb.status in ('owned', 'for_sale') and p.show_collection is not false group by cb.base_id
  ), wanted as (
    select cb.base_id, count(distinct cb.user_id)::integer as want
    from collection_bases cb join profiles p on p.id = cb.user_id
    where cb.status = 'wishlist' and p.show_collection is not false and p.show_wantlist is not false
      and not exists (select 1 from collection_bases own where own.user_id = cb.user_id
        and own.base_id = cb.base_id and own.status in ('owned', 'for_sale'))
    group by cb.base_id
  ), listed as (
    select coalesce(gi.base_gcd_issue_id, ml.gcd_issue_id)::bigint as base_id, count(*)::integer as for_sale
    from marketplace_listings ml left join gcd_issues gi on gi.gcd_id = ml.gcd_issue_id
    where ml.gcd_issue_id is not null group by coalesce(gi.base_gcd_issue_id, ml.gcd_issue_id)
  ), bases as (select base_id from owned union select base_id from wanted union select base_id from listed)
  select b.base_id as base_gcd_issue_id, coalesce(o.have, 0)::integer as have,
    coalesce(w.want, 0)::integer as want, coalesce(l.for_sale, 0)::integer as for_sale, now() as updated_at
  from bases b left join owned o using (base_id) left join wanted w using (base_id) left join listed l using (base_id)
  where coalesce(o.have, 0) > 0 or coalesce(w.want, 0) > 0 or coalesce(l.for_sale, 0) > 0;

  delete from issue_base_stats current where not exists
    (select 1 from next_issue_base_stats next where next.base_gcd_issue_id = current.base_gcd_issue_id);
  insert into issue_base_stats (base_gcd_issue_id, have, want, for_sale, updated_at)
  select base_gcd_issue_id, have, want, for_sale, updated_at from next_issue_base_stats
  on conflict (base_gcd_issue_id) do update set have = excluded.have, want = excluded.want,
    for_sale = excluded.for_sale, updated_at = excluded.updated_at;
  select count(*)::integer into refreshed from next_issue_base_stats;
  return refreshed;
end $$;

revoke all on function public.refresh_issue_base_stats() from public, anon, authenticated;
grant execute on function public.refresh_issue_base_stats() to service_role;
commit;

-- Rollback: drop function public.refresh_issue_base_stats(); drop table public.issue_base_stats;
