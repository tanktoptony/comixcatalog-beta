-- Track when a member last opened their follower notifications. This is an
-- owner-managed profile field, not a billing field. Existing profile UPDATE
-- RLS continues to restrict browser writes to auth.uid() = id.

begin;

alter table public.profiles
  add column if not exists followers_seen_at timestamptz null;

-- Keep the intent explicit if profile UPDATE is later converted from a table
-- grant to column grants. Row-level ownership is still enforced by profiles RLS.
grant update (followers_seen_at) on public.profiles to authenticated;

commit;

-- Check (expect true, true, false):
-- select exists (
--          select 1 from information_schema.columns
--          where table_schema = 'public' and table_name = 'profiles'
--            and column_name = 'followers_seen_at'
--        ) as column_exists,
--        has_column_privilege('authenticated', 'public.profiles', 'followers_seen_at', 'UPDATE') as owner_can_update,
--        has_column_privilege('anon', 'public.profiles', 'followers_seen_at', 'UPDATE') as anon_can_update;
