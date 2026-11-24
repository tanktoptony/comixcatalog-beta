-- Comments under issues, lists and reviews (one level of replies), and the
-- notifications they create (replies, @mentions, comments on your list or
-- review). The notification bell reads the same table later.
-- Service role only: RLS is on with no browser policies, like issue_reviews.
--
-- Rollback:
--   drop table if exists public.notifications;
--   drop table if exists public.comments;

begin;

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('issue', 'list', 'review')),
  -- Base gcd id as text for issues, uuid text for lists and reviews.
  target_id text not null check (char_length(target_id) between 1 and 64),
  parent_id uuid references public.comments(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  -- Soft delete keeps replies attached; reads never return the body.
  deleted_at timestamptz
);

create index if not exists comments_target_idx on public.comments (target_type, target_id, created_at);
create index if not exists comments_user_idx on public.comments (user_id, created_at desc);
create index if not exists comments_parent_idx on public.comments (parent_id) where parent_id is not null;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('comment', 'reply', 'mention', 'review', 'trade_match', 'wantlist_for_sale', 'follow')),
  url text not null check (url like '/%' and char_length(url) <= 500),
  label text not null check (char_length(label) between 1 and 300),
  excerpt text check (excerpt is null or char_length(excerpt) <= 200),
  comment_id uuid references public.comments(id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  emailed_at timestamptz
);

create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications (user_id) where read_at is null;

alter table public.comments enable row level security;
alter table public.notifications enable row level security;
revoke all on public.comments from anon, authenticated;
revoke all on public.notifications from anon, authenticated;

commit;

-- Check (expect true, true, false, false):
-- select (select relrowsecurity from pg_class where oid = 'public.comments'::regclass),
--        (select relrowsecurity from pg_class where oid = 'public.notifications'::regclass),
--        has_table_privilege('anon', 'public.comments', 'SELECT'),
--        has_table_privilege('authenticated', 'public.notifications', 'SELECT');
