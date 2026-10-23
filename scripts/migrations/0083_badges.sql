begin;

create table public.user_badges (
  user_id uuid not null references auth.users(id) on delete cascade,
  badge_id text not null,
  earned_at timestamptz not null default now(),
  primary key (user_id, badge_id)
);

alter table public.user_badges enable row level security;

create policy "Users can read own badges"
  on public.user_badges for select
  using (auth.uid() = user_id);

create view public.badge_rarity with (security_invoker = true) as
  select badge_id, count(*)::bigint as earned_count
  from public.user_badges
  group by badge_id;

revoke all on public.badge_rarity from anon, authenticated;
grant select on public.badge_rarity to service_role;

alter table public.profiles
  add column showcase_badges text[] not null default '{}';

alter table public.profiles
  add constraint profiles_showcase_badges_max_four
  check (cardinality(showcase_badges) <= 4);

commit;

-- Rollback:
-- alter table public.profiles drop constraint if exists profiles_showcase_badges_max_four;
-- alter table public.profiles drop column if exists showcase_badges;
-- drop view if exists public.badge_rarity;
-- drop table if exists public.user_badges;
