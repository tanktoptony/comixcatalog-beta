-- Rollback: drop function public.sitemap_issue_ids(integer, integer); drop table public.sitemap_issue_chunks;
begin;

-- The issue pages listed in the sitemap, one row per 50,000-wide range of
-- gcd_id, so no file can pass Google's 50,000-URL limit and an issue stays in
-- the same file for good. scripts/buildIssueSitemap.js rewrites a row only
-- when its list changes, and the sitemap routes read one row by primary key.
create table public.sitemap_issue_chunks (
  chunk integer primary key,
  gcd_ids integer[] not null,
  url_count integer not null,
  updated_at timestamptz not null default now()
);

alter table public.sitemap_issue_chunks enable row level security;
revoke all on public.sitemap_issue_chunks from public, anon, authenticated;
grant select, insert, update, delete on public.sitemap_issue_chunks to service_role;

-- The issues in one id range that are worth listing: a base edition in a
-- US-market series with a linked cover, a key_issues row, or at least two
-- credit rows. It starts from those three indexes and only then touches
-- gcd_issues, so it reads the rows it keeps instead of the whole table:
-- 27k buffers and 33 ms on a sample range, against 261k buffers and 595 ms
-- when starting from gcd_issues (2026-11-04).
create or replace function public.sitemap_issue_ids(range_start integer, range_end integer)
returns integer[]
language sql stable security definer set search_path = public
as $$
  select coalesce(array_agg(i.gcd_id::integer order by i.gcd_id), '{}'::integer[])
  from (
    select ic.gcd_issue_id as id from issue_creators ic
      where ic.gcd_issue_id >= range_start and ic.gcd_issue_id < range_end
      group by ic.gcd_issue_id having count(*) >= 2
    union
    select c.gcd_issue_id from canonical_covers c
      where c.gcd_issue_id >= range_start and c.gcd_issue_id < range_end
    union
    select k.gcd_issue_id from key_issues k
      where k.gcd_issue_id >= range_start and k.gcd_issue_id < range_end
  ) evidence
  join gcd_issues i on i.gcd_id = evidence.id
  join series s on s.gcd_id = i.series_gcd_id
  where i.variant_of_gcd_id is null
    and (i.base_gcd_issue_id is null or i.base_gcd_issue_id = i.gcd_id)
    and s.us_market is true
    and s.year_start_cached is not null;
$$;

revoke all on function public.sitemap_issue_ids(integer, integer) from public, anon, authenticated;
grant execute on function public.sitemap_issue_ids(integer, integer) to service_role;

commit;
