-- Community suggestions computed in SQL so collection rows never cross the API.
-- Each collection input is capped to the viewer's and each candidate's 500 most
-- recent owned catalog rows. The partial user/status index makes those bounded
-- probes index-backed and avoids scanning every collection on every request.

-- Run on its own first (CONCURRENTLY cannot run inside a transaction, and a
-- non-concurrent build would block writes to the collections table).
create index concurrently if not exists user_collections_people_suggestions_idx
  on public.user_collections (user_id, created_at desc)
  include (gcd_issue_id)
  where status in ('owned', 'for_sale') and gcd_issue_id is not null;

begin;

create or replace function public.people_suggestions(
  p_viewer uuid,
  p_limit integer default 24
)
returns table (
  user_id uuid,
  reason_kind text,
  reason_text text,
  score numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with viewer_profile as (
    select id, location, signup_source, signup_medium
    from public.profiles
    where id = p_viewer
  ),
  eligible as (
    select p.id, p.username, p.location, p.signup_source, p.signup_medium
    from public.profiles p
    where p.id <> p_viewer
      and p.is_public is not false
      and p.username is not null
      and lower(p.username) not in ('test_tony', 'test_tony_depaul')
      and not exists (
        select 1 from public.follows f
        where f.follower_id = p_viewer and f.followee_id = p.id
      )
      and not exists (
        select 1 from public.user_blocks b
        where (b.blocker_id = p_viewer and b.blocked_id = p.id)
           or (b.blocker_id = p.id and b.blocked_id = p_viewer)
      )
  ),
  viewer_books as (
    select uc.gcd_issue_id
    from public.user_collections uc
    where uc.user_id = p_viewer
      and uc.status in ('owned', 'for_sale')
      and uc.gcd_issue_id is not null
    order by uc.created_at desc
    limit 500
  ),
  viewer_series as (
    select gi.series_gcd_id, max(gs.title)::text as title
    from viewer_books vb
    join public.gcd_issues gi on gi.gcd_id = vb.gcd_issue_id
    left join lateral (
      select s.title, s.resolved_publisher_cached
      from public.series s
      where s.gcd_id = gi.series_gcd_id
      limit 1
    ) gs on true
    where gi.series_gcd_id is not null
    group by gi.series_gcd_id
  ),
  shared as (
    select e.id as user_id, count(distinct gi.series_gcd_id) as matches,
      min(vs.title) as first_title
    from eligible e
    cross join lateral (
      select uc.gcd_issue_id
      from public.user_collections uc
      where uc.user_id = e.id
        and uc.status in ('owned', 'for_sale')
        and uc.gcd_issue_id is not null
      order by uc.created_at desc
      limit 500
    ) candidate_books
    join public.gcd_issues gi on gi.gcd_id = candidate_books.gcd_issue_id
    join viewer_series vs on vs.series_gcd_id = gi.series_gcd_id
    group by e.id
  ),
  viewer_publishers as (
    select coalesce(nullif(gs.resolved_publisher_cached, 'Unknown Publisher'), gp.name)::text as publisher,
      count(*) as books
    from viewer_books vb
    join public.gcd_issues gi on gi.gcd_id = vb.gcd_issue_id
    left join lateral (
      select s.title, s.resolved_publisher_cached
      from public.series s
      where s.gcd_id = gi.series_gcd_id
      limit 1
    ) gs on true
    left join public.gcd_publishers gp on gp.gcd_id = gi.publisher_gcd_id
    group by 1
    order by books desc, publisher
    limit 1
  ),
  candidate_publishers as (
    select e.id as user_id,
      coalesce(nullif(gs.resolved_publisher_cached, 'Unknown Publisher'), gp.name)::text as publisher,
      count(*) as books,
      row_number() over (partition by e.id order by count(*) desc) as rank
    from eligible e
    cross join lateral (
      select uc.gcd_issue_id
      from public.user_collections uc
      where uc.user_id = e.id and uc.status in ('owned', 'for_sale') and uc.gcd_issue_id is not null
      order by uc.created_at desc
      limit 500
    ) candidate_books
    join public.gcd_issues gi on gi.gcd_id = candidate_books.gcd_issue_id
    left join lateral (
      select s.title, s.resolved_publisher_cached
      from public.series s
      where s.gcd_id = gi.series_gcd_id
      limit 1
    ) gs on true
    left join public.gcd_publishers gp on gp.gcd_id = gi.publisher_gcd_id
    group by e.id, 2
  ),
  reasons (user_id, reason_kind, reason_text, score) as (
    select s.user_id, 'shared_runs'::text,
      ('Also collects ' || coalesce(s.first_title, 'the same runs') ||
        case when s.matches > 1 then ' and ' || (s.matches - 1) || ' more' else '' end)::text,
      (100 + s.matches * 10)::numeric
    from shared s
    union all
    select e.id, 'followed_by', ('Followed by @' || min(p.username))::text, 80::numeric
    from eligible e
    join public.follows mutual on mutual.followee_id = e.id
    join public.follows mine on mine.followee_id = mutual.follower_id and mine.follower_id = p_viewer
    join public.profiles p on p.id = mutual.follower_id
    group by e.id
    union all
    select e.id, 'same_shop', ('Also from ' || initcap(replace(e.signup_source, '-', ' ')))::text, 60::numeric
    from eligible e cross join viewer_profile v
    where e.signup_medium = 'print' and v.signup_medium = 'print'
      and e.signup_source is not null and lower(e.signup_source) = lower(v.signup_source)
    union all
    select cp.user_id, 'same_publisher', (cp.publisher || ' collector')::text, 40::numeric
    from candidate_publishers cp cross join viewer_publishers vp
    where cp.rank = 1 and lower(cp.publisher) = lower(vp.publisher)
    union all
    select e.id, 'same_location', ('Also in ' || e.location)::text, 20::numeric
    from eligible e cross join viewer_profile v
    where e.location is not null and v.location is not null and lower(trim(e.location)) = lower(trim(v.location))
  ),
  ranked as (
    select r.*, row_number() over (
      partition by r.user_id order by r.score desc,
      case r.reason_kind when 'shared_runs' then 5 when 'followed_by' then 4 when 'same_shop' then 3 when 'same_publisher' then 2 else 1 end desc
    ) as strongest
    from reasons r
  )
  select r.user_id, r.reason_kind, r.reason_text, r.score
  from ranked r
  where r.strongest = 1
  order by r.score desc, r.user_id
  limit least(greatest(coalesce(p_limit, 24), 1), 50);
$$;

revoke all on function public.people_suggestions(uuid, integer) from public, anon, authenticated;
grant execute on function public.people_suggestions(uuid, integer) to service_role;

commit;

-- Rollback:
-- drop function if exists public.people_suggestions(uuid, integer);
-- drop index if exists public.user_collections_people_suggestions_idx;
