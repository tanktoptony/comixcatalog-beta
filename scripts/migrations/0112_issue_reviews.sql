-- Issue ratings and optional reviews, shared by every edition of a base issue.
-- Service role only: RLS is enabled with no browser policies.
--
-- Rollback:
--   alter table public.reports drop constraint if exists reports_target_type_check;
--   alter table public.reports add constraint reports_target_type_check check (target_type in ('listing', 'message', 'user', 'photo', 'sale', 'order', 'feedback'));
--   drop table if exists public.issue_reviews;

begin;

create table if not exists public.issue_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  base_gcd_issue_id integer not null,
  rating smallint not null check (rating between 1 and 5),
  body text check (body is null or char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, base_gcd_issue_id)
);

create index if not exists issue_reviews_issue_idx on public.issue_reviews (base_gcd_issue_id, created_at desc);
create index if not exists issue_reviews_user_idx on public.issue_reviews (user_id, created_at desc);
alter table public.issue_reviews enable row level security;
revoke all on public.issue_reviews from anon, authenticated;

alter table public.reports drop constraint if exists reports_target_type_check;
alter table public.reports add constraint reports_target_type_check
  check (target_type in ('listing', 'message', 'user', 'photo', 'sale', 'order', 'feedback', 'review', 'list', 'comment'));

commit;
