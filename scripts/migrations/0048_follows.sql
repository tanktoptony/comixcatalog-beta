-- One-way member follows. Reads are limited to the two people on a row;
-- writes go through /api/follows so block and rate-limit checks cannot be
-- bypassed from a browser.

begin;

create table if not exists public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  followee_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);

create index if not exists follows_followee_id_idx
  on public.follows (followee_id);

alter table public.follows enable row level security;

drop policy if exists "follows_select_participant" on public.follows;
create policy "follows_select_participant"
  on public.follows for select
  to authenticated
  using (auth.uid() = follower_id or auth.uid() = followee_id);

grant select on public.follows to authenticated;
revoke select on public.follows from anon;
revoke insert, update, delete on public.follows from anon, authenticated;

commit;

-- Check (expect true, false):
-- select c.relrowsecurity as rls_enabled,
--        has_table_privilege('authenticated', 'public.follows', 'INSERT') as authenticated_can_insert
-- from pg_class c
-- join pg_namespace n on n.oid = c.relnamespace
-- where n.nspname = 'public' and c.relname = 'follows';
