-- 0111_email_campaign_sends.sql
--
-- One row per member per one-off email campaign (first use: the November
-- 2026 collection value email, campaign 'value-2026-11'). The sender claims
-- the row before sending, so a re-run or a second dispatch can never email
-- the same member twice. Service role only: RLS on, no policies.
--
-- Rollback:
--   drop table if exists public.email_campaign_sends;

begin;

create table if not exists public.email_campaign_sends (
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign text not null check (campaign ~ '^[a-z0-9-]{3,64}$'),
  sent_at timestamptz not null default now(),
  primary key (user_id, campaign)
);

alter table public.email_campaign_sends enable row level security;

commit;
