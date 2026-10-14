-- 0067: persisted series card cover for search results.
--
-- Measured 2026-10-14 (live, first hit): "batman" 17 s, "spider-man" 8.6 s,
-- of which 8-11 s was resolveSeriesCovers picking a card cover for the ~36
-- series a page shows. A third of those series have no covered issue at all,
-- so every search walked every one of their issues (5,370 for "batman").
--
-- The pick is a pure function of the series row, its gcd_issues, the
-- canonical_covers rows that can match them and gcd_series format, so it is
-- stored on the series row and recomputed only after one of those changes:
--   card_cover_checked_at  null = unknown (recompute), set = card_cover_path
--                          is the pick, and a null path means "no cover".
--   card_cover_version     bumped by every invalidation. The app saves a pick
--                          only if the version it claimed is still current,
--                          so a cover written mid-computation is never lost.
--   card_cover_claimed_at  set when the app starts computing a pick; rows
--                          claimed in the last 10 minutes are invalidated even
--                          though they are not checked yet.
--
-- Invalidation is done by triggers so every writer is covered: the Python
-- ingester, the repair/relink scripts, admin tools and SQL pastes. They mark
-- a superset of the affected series stale, mirroring the resolver's tiers in
-- src/lib/catalog/covers.js:
--   tier 1   cover.gcd_issue_id -> gcd_issues.series_gcd_id
--   tier 2   cover.series_gcd_id
--   tier 3 / sibling  series whose title_normalized equals the cover's
--            compact title with or without a leading "the", limited to series
--            whose year span (+-2) contains a year in the cover's cover_date or
--            series_year (all of them when either side has no year)
--   series   title, gcd_id, year span or publisher change on the row itself;
--            title_normalized or gcd_id change/insert/delete also stales
--            same-titled series (they are each other's sibling pool)
--   issues   gcd_issues insert/delete or a change to series_gcd_id,
--            issue_number, key_date or publication_date
--   format   gcd_series publishing_format/binding (sibling format check)
--
-- Run alone. Adding columns with constant defaults is metadata-only. The lock
-- timeout makes it fail fast (just re-run) instead of queueing every series
-- read behind a long-running ingest transaction.

begin;

set local lock_timeout = '5s';

alter table public.series
  add column if not exists card_cover_path text,
  add column if not exists card_cover_checked_at timestamptz,
  add column if not exists card_cover_claimed_at timestamptz,
  add column if not exists card_cover_version integer not null default 0;

-- Marks the matching series stale. Writes only rows that hold a pick or are
-- being computed, so repeated invalidations of the same series are no-ops.
create or replace function public.series_card_cover_stale(
  p_gcd_ids bigint[],
  p_title_keys text[],
  p_years integer[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.series s
     set card_cover_path = null,
         card_cover_checked_at = null,
         card_cover_version = s.card_cover_version + 1
   where (s.card_cover_checked_at is not null
          or s.card_cover_claimed_at > now() - interval '10 minutes')
     and (
       s.gcd_id = any (coalesce(p_gcd_ids, '{}'::bigint[]))
       or (
         s.title_normalized = any (coalesce(p_title_keys, '{}'::text[]))
         and (
           coalesce(cardinality(p_years), 0) = 0
           or s.year_start_cached is null
           or s.year_end_cached is null
           or exists (
             select 1 from unnest(p_years) as y
             where y between s.year_start_cached - 2 and s.year_end_cached + 2
           )
         )
       )
     );
end;
$$;

create or replace function public.series_card_cover_stale_for_cover(
  p_series_gcd_id bigint,
  p_gcd_issue_id bigint,
  p_series_title text,
  p_cover_date text,
  p_series_year text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids bigint[] := '{}'::bigint[];
  v_owner bigint;
  v_compact text := regexp_replace(lower(coalesce(p_series_title, '')), '[^a-z0-9]', '', 'g');
  v_keys text[] := '{}'::text[];
  v_years integer[];
begin
  if p_series_gcd_id is not null then
    v_ids := v_ids || p_series_gcd_id;
  end if;
  if p_gcd_issue_id is not null then
    select gi.series_gcd_id into v_owner from public.gcd_issues gi where gi.gcd_id = p_gcd_issue_id;
    if v_owner is not null then
      v_ids := v_ids || v_owner;
    end if;
  end if;
  if v_compact <> '' then
    v_keys := array[v_compact, 'the' || v_compact, regexp_replace(v_compact, '^the', '')];
  end if;
  -- Every 4-digit run, a superset of the resolver's yearOf() + series_year.
  select coalesce(array_agg(m[1]::integer), '{}'::integer[]) into v_years
  from regexp_matches(coalesce(p_cover_date, '') || ' ' || coalesce(p_series_year, ''), '([0-9]{4})', 'g') as m;
  perform public.series_card_cover_stale(v_ids, v_keys, v_years);
end;
$$;

create or replace function public.canonical_covers_card_cover_stale()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.series_card_cover_stale_for_cover(
      old.series_gcd_id::bigint, old.gcd_issue_id::bigint, old.series_title::text,
      old.cover_date::text, old.series_year::text);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.series_card_cover_stale_for_cover(
      new.series_gcd_id::bigint, new.gcd_issue_id::bigint, new.series_title::text,
      new.cover_date::text, new.series_year::text);
  end if;
  return null;
end;
$$;

drop trigger if exists canonical_covers_card_cover_stale_ins_del on public.canonical_covers;
create trigger canonical_covers_card_cover_stale_ins_del
  after insert or delete on public.canonical_covers
  for each row execute function public.canonical_covers_card_cover_stale();

drop trigger if exists canonical_covers_card_cover_stale_upd on public.canonical_covers;
create trigger canonical_covers_card_cover_stale_upd
  after update on public.canonical_covers
  for each row
  when (
    old.storage_path is distinct from new.storage_path
    or old.gcd_issue_id is distinct from new.gcd_issue_id
    or old.series_gcd_id is distinct from new.series_gcd_id
    or old.series_title is distinct from new.series_title
    or old.issue_number is distinct from new.issue_number
    or old.series_year is distinct from new.series_year
    or old.cover_date is distinct from new.cover_date
    or old.publisher is distinct from new.publisher
    or old.created_at is distinct from new.created_at
  )
  execute function public.canonical_covers_card_cover_stale();

-- The series row's own inputs: reset in place, no extra write.
create or replace function public.series_card_cover_reset_self()
returns trigger
language plpgsql
as $$
begin
  new.card_cover_path := null;
  new.card_cover_checked_at := null;
  new.card_cover_version := old.card_cover_version + 1;
  return new;
end;
$$;

drop trigger if exists series_card_cover_reset_self on public.series;
create trigger series_card_cover_reset_self
  before update on public.series
  for each row
  when (
    old.title is distinct from new.title
    or old.gcd_id is distinct from new.gcd_id
    or old.year_start_cached is distinct from new.year_start_cached
    or old.year_end_cached is distinct from new.year_end_cached
    or old.resolved_publisher_cached is distinct from new.resolved_publisher_cached
  )
  execute function public.series_card_cover_reset_self();

-- Same-titled series are each other's sibling pool (fetched by exact
-- title_normalized), so adding, removing or retitling one stales the others.
create or replace function public.series_card_cover_stale_siblings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_keys text[] := '{}'::text[];
begin
  if tg_op in ('UPDATE', 'DELETE') and old.title_normalized is not null then
    v_keys := v_keys || old.title_normalized::text;
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.title_normalized is not null then
    v_keys := v_keys || new.title_normalized::text;
  end if;
  if cardinality(v_keys) > 0 then
    perform public.series_card_cover_stale('{}'::bigint[], v_keys, null);
  end if;
  return null;
end;
$$;

drop trigger if exists series_card_cover_stale_siblings_ins_del on public.series;
create trigger series_card_cover_stale_siblings_ins_del
  after insert or delete on public.series
  for each row execute function public.series_card_cover_stale_siblings();

drop trigger if exists series_card_cover_stale_siblings_upd on public.series;
create trigger series_card_cover_stale_siblings_upd
  after update on public.series
  for each row
  when (
    old.title_normalized is distinct from new.title_normalized
    or old.gcd_id is distinct from new.gcd_id
  )
  execute function public.series_card_cover_stale_siblings();

create or replace function public.gcd_issues_card_cover_stale()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids bigint[] := '{}'::bigint[];
begin
  if tg_op in ('UPDATE', 'DELETE') and old.series_gcd_id is not null then
    v_ids := v_ids || old.series_gcd_id::bigint;
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.series_gcd_id is not null then
    v_ids := v_ids || new.series_gcd_id::bigint;
  end if;
  if cardinality(v_ids) > 0 then
    perform public.series_card_cover_stale(v_ids, '{}'::text[], null);
  end if;
  return null;
end;
$$;

drop trigger if exists gcd_issues_card_cover_stale_ins_del on public.gcd_issues;
create trigger gcd_issues_card_cover_stale_ins_del
  after insert or delete on public.gcd_issues
  for each row execute function public.gcd_issues_card_cover_stale();

drop trigger if exists gcd_issues_card_cover_stale_upd on public.gcd_issues;
create trigger gcd_issues_card_cover_stale_upd
  after update on public.gcd_issues
  for each row
  when (
    old.series_gcd_id is distinct from new.series_gcd_id
    or old.issue_number is distinct from new.issue_number
    or old.key_date is distinct from new.key_date
    or old.publication_date is distinct from new.publication_date
  )
  execute function public.gcd_issues_card_cover_stale();

create or replace function public.gcd_series_card_cover_stale()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gcd_id bigint := case when tg_op = 'DELETE' then old.gcd_id else new.gcd_id end;
  v_keys text[];
begin
  select coalesce(array_agg(s.title_normalized::text), '{}'::text[]) into v_keys
  from public.series s where s.gcd_id = v_gcd_id and s.title_normalized is not null;
  perform public.series_card_cover_stale(array[v_gcd_id], v_keys, null);
  return null;
end;
$$;

drop trigger if exists gcd_series_card_cover_stale_ins_del on public.gcd_series;
create trigger gcd_series_card_cover_stale_ins_del
  after insert or delete on public.gcd_series
  for each row execute function public.gcd_series_card_cover_stale();

drop trigger if exists gcd_series_card_cover_stale_upd on public.gcd_series;
create trigger gcd_series_card_cover_stale_upd
  after update on public.gcd_series
  for each row
  when (
    old.publishing_format is distinct from new.publishing_format
    or old.binding is distinct from new.binding
  )
  execute function public.gcd_series_card_cover_stale();

-- App read path. Returns each series' stored pick and claims the misses in
-- the same call; the caller computes the misses and saves them with the
-- returned version.
create or replace function public.claim_series_card_covers(p_ids uuid[])
returns table (
  id uuid,
  gcd_id integer,
  title text,
  year_start_cached integer,
  year_end_cached integer,
  resolved_publisher_cached text,
  card_cover_path text,
  card_cover_checked boolean,
  card_cover_version integer
)
language plpgsql
volatile
set search_path = public
as $$
#variable_conflict use_column
begin
  update public.series s
     set card_cover_claimed_at = now()
   where s.id = any (p_ids)
     and s.card_cover_checked_at is null
     and (s.card_cover_claimed_at is null or s.card_cover_claimed_at < now() - interval '1 minute');

  return query
  select s.id, s.gcd_id::integer, s.title::text, s.year_start_cached, s.year_end_cached,
         s.resolved_publisher_cached::text, s.card_cover_path,
         s.card_cover_checked_at is not null, s.card_cover_version
  from public.series s
  where s.id = any (p_ids);
end;
$$;

-- Saves picks whose version is still current; returns how many were saved.
create or replace function public.save_series_card_covers(p_picks jsonb)
returns integer
language sql
volatile
set search_path = public
as $$
  with picks as (
    select * from jsonb_to_recordset(coalesce(p_picks, '[]'::jsonb))
      as p(id uuid, version integer, path text)
  ), saved as (
    update public.series s
       set card_cover_path = picks.path,
           card_cover_checked_at = now(),
           card_cover_claimed_at = null
      from picks
     where s.id = picks.id
       and s.card_cover_version = picks.version
    returning 1
  )
  select count(*)::integer from saved;
$$;

revoke all on function public.series_card_cover_stale(bigint[], text[], integer[]) from public, anon, authenticated;
revoke all on function public.series_card_cover_stale_for_cover(bigint, bigint, text, text, text) from public, anon, authenticated;
revoke all on function public.claim_series_card_covers(uuid[]) from public, anon, authenticated;
revoke all on function public.save_series_card_covers(jsonb) from public, anon, authenticated;
grant execute on function public.claim_series_card_covers(uuid[]) to service_role;
grant execute on function public.save_series_card_covers(jsonb) to service_role;

commit;

notify pgrst, 'reload schema';

-- Rollback:
--   drop trigger if exists canonical_covers_card_cover_stale_ins_del on public.canonical_covers;
--   drop trigger if exists canonical_covers_card_cover_stale_upd on public.canonical_covers;
--   drop trigger if exists series_card_cover_reset_self on public.series;
--   drop trigger if exists series_card_cover_stale_siblings_ins_del on public.series;
--   drop trigger if exists series_card_cover_stale_siblings_upd on public.series;
--   drop trigger if exists gcd_issues_card_cover_stale_ins_del on public.gcd_issues;
--   drop trigger if exists gcd_issues_card_cover_stale_upd on public.gcd_issues;
--   drop trigger if exists gcd_series_card_cover_stale_ins_del on public.gcd_series;
--   drop trigger if exists gcd_series_card_cover_stale_upd on public.gcd_series;
--   drop function if exists public.claim_series_card_covers(uuid[]);
--   drop function if exists public.save_series_card_covers(jsonb);
--   drop function if exists public.canonical_covers_card_cover_stale();
--   drop function if exists public.series_card_cover_reset_self();
--   drop function if exists public.series_card_cover_stale_siblings();
--   drop function if exists public.gcd_issues_card_cover_stale();
--   drop function if exists public.gcd_series_card_cover_stale();
--   drop function if exists public.series_card_cover_stale_for_cover(bigint, bigint, text, text, text);
--   drop function if exists public.series_card_cover_stale(bigint[], text[], integer[]);
--   alter table public.series drop column if exists card_cover_path,
--     drop column if exists card_cover_checked_at, drop column if exists card_cover_claimed_at,
--     drop column if exists card_cover_version;
