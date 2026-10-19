-- 0080: public series-page rollups. Each function keeps its feature to one
-- database query; both are service-role only and return aggregates, never
-- member identities. lower(title) index so the sibling-run lookup doesn't
-- scan all ~211k series on every series page view.
-- APPLIED IN PROD 2026-10-18.

-- Run on its own first (CONCURRENTLY cannot run inside a transaction).
create index concurrently if not exists series_lower_title_idx on public.series (lower(title));

begin;

create or replace function public.series_public_member_stats(p_series_gcd_id bigint)
returns table(owners bigint, copies bigint)
language sql stable security definer set search_path = public
as $$
  select count(distinct uc.user_id)::bigint, count(*)::bigint
  from public.user_collections uc
  join public.gcd_issues gi on gi.gcd_id = uc.gcd_issue_id
  join public.profiles p on p.id = uc.user_id
  where gi.series_gcd_id = p_series_gcd_id
    and uc.status <> 'wishlist'
    and lower(coalesce(p.username, '')) not in ('test_tony', 'test_tony_depaul');
$$;

create or replace function public.series_sibling_runs(p_title text, p_publisher text, p_current uuid)
returns table(
  id uuid,
  title text,
  gcd_id bigint,
  issue_count_cached integer,
  year_start_cached integer,
  year_end_cached integer,
  resolved_publisher_cached text,
  us_market boolean,
  reprint_count integer,
  total_count bigint
)
language sql stable security definer set search_path = public
as $$
  with eligible as (
    select s.*, row_number() over(order by s.year_start_cached asc nulls last) as position,
      count(*) over()::bigint as run_count
    from public.series s
    left join public.gcd_series gs on gs.gcd_id = s.gcd_id
    where lower(s.title) = lower(p_title)
      and lower(s.resolved_publisher_cached) = lower(p_publisher)
      and s.us_market is true
      -- Same GCD publisher as the current run: foreign editions (Panini
      -- Deutschland, Editora Abril...) can carry a DC-resolved publisher and
      -- us_market = true, but never DC's GCD publisher id.
      and gs.publisher_gcd_id = (
        select cur.publisher_gcd_id from public.series cs
        join public.gcd_series cur on cur.gcd_id = cs.gcd_id
        where cs.id = p_current
      )
      and s.issue_count_cached >= 5
      and not (
        coalesce(gs.publishing_format, '') ~* 'collected|trade paperback|hardcover|omnibus|graphic novel|compendium|library edition|deluxe edition|absolute edition'
        or (
          coalesce(gs.publishing_format, '') <> ''
          and coalesce(gs.binding, '') ~* 'trade paperback|hardcover|hard cover|squarebound|perfect bound|omnibus'
          and coalesce(gs.publishing_format, '') !~* 'ongoing|limited|one-shot|series'
        )
      )
  )
  select e.id, e.title, e.gcd_id::bigint, e.issue_count_cached,
    e.year_start_cached, e.year_end_cached, e.resolved_publisher_cached,
    e.us_market, e.reprint_count, e.run_count
  from eligible e
  where e.position <= 5 or e.id = p_current
  order by e.year_start_cached asc nulls last
  limit 6;
$$;

revoke all on function public.series_public_member_stats(bigint) from public;
revoke all on function public.series_sibling_runs(text, text, uuid) from public;
grant execute on function public.series_public_member_stats(bigint) to service_role;
grant execute on function public.series_sibling_runs(text, text, uuid) to service_role;

commit;

-- Rollback:
-- drop function if exists public.series_sibling_runs(text, text, uuid);
-- drop function if exists public.series_public_member_stats(bigint);
-- drop index if exists public.series_lower_title_idx;
