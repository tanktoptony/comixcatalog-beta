-- 0116_email_preferences.sql
--
-- Two more email preferences on notification_settings (migration 0046,
-- owner read/insert/update under RLS):
--   email_activity      replies, @mentions and comments on your lists and
--                       reviews: 'instant', 'daily' (one summary a day) or
--                       'off'. Default 'daily'.
--   email_weekly_digest the weekly digest (followed collectors' activity,
--                       wantlist books someone listed, trade matches, unread
--                       activity, collection value). Default on.
-- A member with no row gets the defaults; code reads a missing row that way.
-- Sends are tracked on notifications.emailed_at (activity) and
-- email_campaign_sends (digest, one campaign per ISO week).
--
-- Rollback:
--   alter table public.notification_settings drop column if exists email_activity;
--   alter table public.notification_settings drop column if exists email_weekly_digest;

begin;

alter table public.notification_settings
  add column if not exists email_activity text not null default 'daily'
    check (email_activity in ('instant', 'daily', 'off')),
  add column if not exists email_weekly_digest boolean not null default true;

create index if not exists notifications_unemailed_idx
  on public.notifications (user_id, created_at)
  where emailed_at is null and read_at is null;

commit;
