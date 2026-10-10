-- 0047_gcd_issue_credits.sql
-- Creator credits, story titles, characters and synopses per issue, from the
-- Grand Comics Database API (CC BY-SA 4.0, attributed on the pages that show
-- it). Filled gradually by scripts/syncGcdIssueCredits.js; GCD rate-limits
-- hard, so coverage grows a few thousand issues a day, priority pages first.
--
--   gcd_issue_details  one row per issue we've fetched (also the sync cursor:
--                      no row = not fetched yet). not_found marks a 404.
--   gcd_stories        GCD's story sequences for the issue, raw credit text.
--   creators           one row per normalized creator name, with a URL slug.
--   issue_creators     who did what on which issue (role per creator).
--
-- Reference data like canonical_covers: readable by everyone, written only
-- by the service role.

begin;

create table public.gcd_issue_details (
  gcd_issue_id  integer primary key references public.gcd_issues(gcd_id) on delete cascade,
  on_sale_date  text,
  price         text,
  page_count    numeric,
  editing       text,
  not_found     boolean not null default false,
  synced_at     timestamptz not null default now()
);

create table public.gcd_stories (
  gcd_issue_id    integer not null references public.gcd_issues(gcd_id) on delete cascade,
  sequence_number integer not null,
  type            text,
  title           text,
  feature         text,
  script          text,
  pencils         text,
  inks            text,
  colors          text,
  letters         text,
  characters      text,
  synopsis        text,
  page_count      numeric,
  primary key (gcd_issue_id, sequence_number)
);

create table public.creators (
  id         bigint generated always as identity primary key,
  name       text not null unique,
  slug       text not null unique,
  created_at timestamptz not null default now()
);

create table public.issue_creators (
  gcd_issue_id integer not null references public.gcd_issues(gcd_id) on delete cascade,
  creator_id   bigint  not null references public.creators(id) on delete cascade,
  role         text    not null check (role in ('writer','penciller','inker','colorist','letterer','cover')),
  primary key (gcd_issue_id, creator_id, role)
);
create index issue_creators_creator_idx on public.issue_creators (creator_id, role);

alter table public.gcd_issue_details enable row level security;
alter table public.gcd_stories       enable row level security;
alter table public.creators          enable row level security;
alter table public.issue_creators    enable row level security;

revoke insert, update, delete, truncate on public.gcd_issue_details, public.gcd_stories, public.creators, public.issue_creators from anon, authenticated;
grant select on public.gcd_issue_details, public.gcd_stories, public.creators, public.issue_creators to anon, authenticated;

create policy "gcd_issue_details readable" on public.gcd_issue_details for select using (true);
create policy "gcd_stories readable"       on public.gcd_stories       for select using (true);
create policy "creators readable"          on public.creators          for select using (true);
create policy "issue_creators readable"    on public.issue_creators    for select using (true);

commit;

-- Check (expect 4 rows, all true / false / true):
-- select c.relname, c.relrowsecurity as rls,
--        has_table_privilege('anon', c.oid, 'INSERT') as anon_insert,
--        has_table_privilege('anon', c.oid, 'SELECT') as anon_select
-- from pg_class c join pg_namespace n on n.oid = c.relnamespace
-- where n.nspname = 'public' and c.relname in ('gcd_issue_details','gcd_stories','creators','issue_creators');

-- Rollback:
-- drop table if exists public.issue_creators;
-- drop table if exists public.creators;
-- drop table if exists public.gcd_stories;
-- drop table if exists public.gcd_issue_details;
