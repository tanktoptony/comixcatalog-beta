-- 0046_message_email_notifications.sql
-- Message emails need a private per-user preference and a service-only
-- throttle record. Keeping both out of profiles avoids exposing notification
-- preferences through that table's anon column-level SELECT grants.

begin;

create table public.notification_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email_on_message boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.notification_settings enable row level security;

revoke all on public.notification_settings from anon;
grant select, insert, update on public.notification_settings to authenticated;

create policy "notification_settings_select_own"
  on public.notification_settings for select to authenticated
  using (auth.uid() = user_id);

create policy "notification_settings_insert_own"
  on public.notification_settings for insert to authenticated
  with check (auth.uid() = user_id);

create policy "notification_settings_update_own"
  on public.notification_settings for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table public.message_email_log (
  recipient_id uuid not null references auth.users(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  last_emailed_at timestamptz not null,
  primary key (recipient_id, sender_id)
);

alter table public.message_email_log enable row level security;
revoke all on public.message_email_log from anon, authenticated;

commit;

-- Check (expect true, true, true, false, true, true):
-- select has_table_privilege('authenticated', 'public.notification_settings', 'SELECT') as settings_select,
--        has_table_privilege('authenticated', 'public.notification_settings', 'INSERT') as settings_insert,
--        has_table_privilege('authenticated', 'public.notification_settings', 'UPDATE') as settings_update,
--        has_table_privilege('authenticated', 'public.notification_settings', 'DELETE') as settings_delete,
--        relrowsecurity as rls_enabled,
--        not has_table_privilege('authenticated', 'public.message_email_log', 'SELECT') as log_service_only
-- from pg_class
-- where oid = 'public.notification_settings'::regclass;

-- Rollback:
-- drop table if exists public.message_email_log;
-- drop table if exists public.notification_settings;
