-- 0115_import_misses.sql
--
-- One row per import row the catalog matcher could not place, and what the
-- AI fallback made of it. Two jobs:
--   1. The real import miss rate. Before this, a missed row was only saved
--      if the collector clicked "Request them" (catalog_requests).
--   2. The per-member daily cap on AI suggestions (rows with outcome ai_*).
-- Holds the collector's own row text, so service role only: RLS on, no
-- policies.
--
-- Rollback:
--   drop table if exists public.import_misses;

begin;

create table if not exists public.import_misses (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  series text,
  issue text,
  publisher text,
  year text,
  outcome text not null check (outcome in ('not_found', 'ai_suggested', 'ai_pick', 'ai_no_match', 'ai_error')),
  suggestion jsonb,
  gcd_issue_id integer,
  created_at timestamptz not null default now()
);

create index if not exists import_misses_user_idx on public.import_misses (user_id, created_at desc);
create index if not exists import_misses_outcome_idx on public.import_misses (outcome, created_at desc);

alter table public.import_misses enable row level security;

commit;
