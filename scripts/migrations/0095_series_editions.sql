begin;

create table public.series_editions (
  edition_gcd_id integer primary key,
  work_gcd_id integer not null,
  role text not null check (role in ('collected','special')),
  source text not null check (source in ('reprints','title')),
  shared_issues integer not null default 0,
  updated_at timestamptz not null default now(),
  check (edition_gcd_id <> work_gcd_id)
);

create index series_editions_work_gcd_id_idx
  on public.series_editions (work_gcd_id);

alter table public.series_editions enable row level security;
revoke insert, update, delete, truncate on public.series_editions from anon, authenticated;
grant select on public.series_editions to anon, authenticated;

create policy "Series editions are publicly readable"
  on public.series_editions
  for select
  to anon, authenticated
  using (true);

create function public.series_reprint_sources(target_ids integer[])
returns table (
  target_series_gcd_id integer,
  origin_series_gcd_id integer,
  issues integer
)
language sql
stable
as $$
  select target.series_gcd_id, origin.series_gcd_id,
    count(distinct r.origin_issue_id)::integer
  from public.issue_reprints r
  join public.gcd_issues origin on origin.gcd_id = r.origin_issue_id
  join public.gcd_issues target on target.gcd_id = r.target_issue_id
  where target.series_gcd_id = any(target_ids)
    and target.series_gcd_id <> origin.series_gcd_id
  group by target.series_gcd_id, origin.series_gcd_id
  order by target.series_gcd_id, origin.series_gcd_id
$$;

revoke execute on function public.series_reprint_sources(integer[]) from public, anon, authenticated;
grant execute on function public.series_reprint_sources(integer[]) to service_role;

commit;

-- Check (expect RLS true, anon SELECT true, anon INSERT false, service execute true):
-- select c.relrowsecurity, has_table_privilege('anon', c.oid, 'SELECT') as anon_select,
--   has_table_privilege('anon', c.oid, 'INSERT') as anon_insert,
--   has_function_privilege('service_role', 'public.series_reprint_sources(integer[])', 'EXECUTE') as service_execute
-- from pg_class c join pg_namespace n on n.oid = c.relnamespace
-- where n.nspname = 'public' and c.relname = 'series_editions';

-- Rollback:
-- drop function if exists public.series_reprint_sources(integer[]);
-- drop table if exists public.series_editions;
