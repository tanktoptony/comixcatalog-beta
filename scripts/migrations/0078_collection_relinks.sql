begin;

create table public.collection_relinks (
  id bigserial primary key,
  user_collection_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  old_comic_id uuid,
  old_gcd_issue_id integer,
  new_gcd_issue_id integer not null,
  method text not null check (method in ('auto', 'member')),
  confidence text not null,
  created_at timestamptz not null default now(),
  reverted_at timestamptz
);

alter table public.collection_relinks enable row level security;

create policy "Members can read their own collection relinks"
  on public.collection_relinks for select
  to authenticated
  using ((select auth.uid()) = user_id);

grant select on public.collection_relinks to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.collection_relinks from anon, authenticated;

alter table public.user_collections
  add column if not exists reconcile_dismissed_at timestamptz;

commit;

-- Rollback:
-- begin;
-- alter table public.user_collections drop column if exists reconcile_dismissed_at;
-- drop table if exists public.collection_relinks;
-- commit;
