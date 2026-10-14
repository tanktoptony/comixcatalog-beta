-- APPLIED IN PROD 2026-10-13. Never re-run. Kept as the record of the schema change.
-- Bulk GCD dump support. Reference data is service-role written and public-read.
begin;

alter table public.creators add column gcd_creator_id integer;
alter table public.creators add constraint creators_gcd_creator_id_key unique (gcd_creator_id);
alter table public.creators drop constraint creators_name_key;
create index creators_name_lower_idx on public.creators (lower(name));
create extension if not exists pg_trgm;
create index creators_name_trgm_idx on public.creators using gin (name gin_trgm_ops);

alter table public.gcd_issue_details
  add column barcode text,
  add column isbn text,
  add column notes text,
  add column indicia_frequency text,
  add column indicia_publisher text,
  add column variant_name text,
  add column keydate text,
  add column rating text;

alter table public.gcd_stories add column job_number text;
alter table public.gcd_stories add column genre text;

create table public.series_creators (
  -- Deliberately not an FK: this repository does not establish that
  -- gcd_series.gcd_id is unique, which PostgreSQL requires for an FK target.
  series_gcd_id integer not null,
  creator_id bigint not null references public.creators(id) on delete cascade,
  role text not null check (role in ('writer','penciller','inker','colorist','letterer','cover')),
  issue_count integer not null check (issue_count >= 0),
  year_first integer,
  year_last integer,
  primary key (series_gcd_id, creator_id, role)
);
create index series_creators_creator_idx on public.series_creators (creator_id, role);

create table public.issue_reprints (
  origin_issue_id integer not null references public.gcd_issues(gcd_id) on delete cascade,
  target_issue_id integer not null references public.gcd_issues(gcd_id) on delete cascade,
  notes text,
  primary key (origin_issue_id, target_issue_id)
);
create index issue_reprints_target_idx on public.issue_reprints (target_issue_id);

alter table public.series_creators enable row level security;
alter table public.issue_reprints enable row level security;
revoke insert, update, delete, truncate on public.series_creators, public.issue_reprints from anon, authenticated;
grant select on public.series_creators, public.issue_reprints to anon, authenticated;
create policy "series_creators readable" on public.series_creators for select using (true);
create policy "issue_reprints readable" on public.issue_reprints for select using (true);

commit;

-- Check (expect 2 rows, all true / false / true):
-- select c.relname, c.relrowsecurity as rls,
--   has_table_privilege('anon', c.oid, 'INSERT') as anon_insert,
--   has_table_privilege('anon', c.oid, 'SELECT') as anon_select
-- from pg_class c join pg_namespace n on n.oid = c.relnamespace
-- where n.nspname = 'public' and c.relname in ('series_creators','issue_reprints');
-- select column_name from information_schema.columns
-- where table_schema='public' and table_name in ('creators','gcd_issue_details','gcd_stories')
-- order by table_name, ordinal_position;

-- Rollback:
-- drop table if exists public.issue_reprints;
-- drop table if exists public.series_creators;
-- alter table public.gcd_stories drop column if exists genre, drop column if exists job_number;
-- alter table public.gcd_issue_details drop column if exists rating, drop column if exists keydate,
--   drop column if exists variant_name, drop column if exists indicia_publisher,
--   drop column if exists indicia_frequency, drop column if exists notes,
--   drop column if exists isbn, drop column if exists barcode;
-- drop index if exists public.creators_name_trgm_idx;
-- drop index if exists public.creators_name_lower_idx;
-- alter table public.creators drop constraint if exists creators_gcd_creator_id_key;
-- alter table public.creators drop column if exists gcd_creator_id;
-- -- Restore only after resolving any duplicate names introduced after this migration:
-- alter table public.creators add constraint creators_name_key unique (name);
