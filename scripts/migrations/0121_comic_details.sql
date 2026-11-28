-- 0121_comic_details.sql
--
-- ComicVine dates, credits, characters and story arcs for approved member-
-- added books that are not in GCD. The sync stores structured facts only,
-- never ComicVine descriptions or decks. Service role writes; public reads
-- are limited to details whose comic has been approved.
--
-- Not applied yet.
--
-- Rollback:
--   drop table if exists public.comic_details;

begin;

create table if not exists public.comic_details (
  comic_id uuid primary key references public.comics(id) on delete cascade,
  comicvine_issue_id integer unique not null,
  issue_name text,
  cover_date date,
  store_date date,
  credits jsonb not null default '[]'::jsonb,
  characters jsonb not null default '[]'::jsonb,
  story_arcs jsonb not null default '[]'::jsonb,
  source_url text,
  synced_at timestamptz not null default now()
);

alter table public.comic_details enable row level security;
revoke all on public.comic_details from anon, authenticated;
grant select on public.comic_details to anon, authenticated;
grant select, insert, update, delete on public.comic_details to service_role;

create policy comic_details_approved_select on public.comic_details
  for select
  using (
    exists (
      select 1
      from public.comics
      where comics.id = comic_details.comic_id
        and comics.review_status = 'approved'
    )
  );

commit;
