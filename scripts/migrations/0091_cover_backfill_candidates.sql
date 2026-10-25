-- 0091: series that still have no cover at all, for the cover backfill lane.
--
-- The width lane's generator orders by issue count ascending and keeps the
-- top 5,000, so with more one-issue series than that, nothing with two or
-- more issues was ever queued (Magneto 2023, Resurrection of Magneto). On
-- 2026-10-25, 33,701 US series with numbered issues and 41,887 single-book
-- series (trades, graphic novels, one-shots, "[nn]" in GCD) had no cover
-- and sat in no queue.
--
-- Returns US-market series with no canonical cover and either numbered
-- issues or exactly one base book, skipping any title/publisher/year shared
-- by another series (a series hint there could file one series' covers
-- under the other). Ordered by publisher tier, then newest first, with start
-- years after this one last.

begin;

create or replace function public.cover_backfill_candidates(
  tier1 text[],
  tier2 text[],
  result_limit integer default 5000
)
returns table (
  gcd_id bigint,
  title text,
  publisher text,
  year_start integer,
  comicvine_volume_id integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with uncovered as (
    select s.gcd_id, s.title, s.resolved_publisher_cached, s.year_start_cached,
           s.comicvine_volume_id, s.issue_count_cached
    from public.series s
    where s.gcd_id is not null
      and s.us_market is true
      and s.featured_cover_path_cached is null
      and not exists (
        select 1 from public.canonical_covers c where c.series_gcd_id = s.gcd_id
      )
  ),
  eligible as (
    select u.* from uncovered u
    where u.issue_count_cached > 0
       or (
         select count(*) from public.gcd_issues i
         where i.series_gcd_id = u.gcd_id and i.variant_of_gcd_id is null
       ) = 1
  ),
  shared_keys as (
    select lower(s.title) t, s.resolved_publisher_cached p, s.year_start_cached y
    from public.series s
    where s.gcd_id is not null
    group by 1, 2, 3
    having count(*) > 1
  )
  select e.gcd_id, e.title, e.resolved_publisher_cached, e.year_start_cached, e.comicvine_volume_id
  from eligible e
  where not exists (
    select 1 from shared_keys k
    where k.t = lower(e.title)
      and k.p is not distinct from e.resolved_publisher_cached
      and k.y is not distinct from e.year_start_cached
  )
  order by
    case
      when e.resolved_publisher_cached = any(tier1) then 0
      when e.resolved_publisher_cached = any(tier2) then 1
      else 2
    end,
    -- Not out yet (or a typo year like 2094): ComicVine rarely has these.
    (e.year_start_cached > extract(year from now())::integer),
    e.year_start_cached desc nulls last,
    e.title
  limit result_limit;
$$;

revoke all on function public.cover_backfill_candidates(text[], text[], integer) from public, anon, authenticated;
grant execute on function public.cover_backfill_candidates(text[], text[], integer) to service_role;

commit;

-- Rollback:
-- drop function if exists public.cover_backfill_candidates(text[], text[], integer);
