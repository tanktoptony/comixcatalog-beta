begin;

-- A pull list follows a GCD series rather than an app series UUID so new
-- issues keep landing in the same list as the catalog mirror is refreshed.
create table public.pull_list_series (
  user_id uuid not null references auth.users(id) on delete cascade,
  series_gcd_id integer not null,
  created_at timestamptz not null default now(),
  primary key (user_id, series_gcd_id)
);

-- The feed reads by user through the primary key. This reverse index keeps
-- series-oriented maintenance and future follower counts off a table scan.
create index pull_list_series_series_gcd_id_idx
  on public.pull_list_series (series_gcd_id);

alter table public.pull_list_series enable row level security;
revoke all on public.pull_list_series from anon;
grant select, insert, delete on public.pull_list_series to authenticated;

create policy "Members can read their pull list"
  on public.pull_list_series
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "Members can follow series"
  on public.pull_list_series
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Members can unfollow series"
  on public.pull_list_series
  for delete
  to authenticated
  using (user_id = auth.uid());

commit;

-- Check (expect RLS true, anon SELECT/INSERT false, authenticated owner-only policies):
-- select c.relrowsecurity, has_table_privilege('anon', c.oid, 'SELECT') as anon_select,
--   has_table_privilege('anon', c.oid, 'INSERT') as anon_insert,
--   has_table_privilege('authenticated', c.oid, 'SELECT') as authenticated_select
-- from pg_class c join pg_namespace n on n.oid = c.relnamespace
-- where n.nspname = 'public' and c.relname = 'pull_list_series';

-- Rollback:
-- drop table if exists public.pull_list_series;
