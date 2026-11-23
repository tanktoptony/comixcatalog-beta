-- 0118: two new notification kinds.
--   review_queue: Tony's one running "N book requests waiting for review" line
--                 (src/lib/reviewQueueNotify.js). Never emailed.
--   request_done: tells a member the book they asked for is in the catalog.
-- Only widens the kind check; no data changes.

begin;

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'comment', 'reply', 'mention', 'review', 'trade_match', 'wantlist_for_sale', 'follow',
  'review_queue', 'request_done'
));

commit;

-- Check (expect one row containing review_queue and request_done):
-- select pg_get_constraintdef(oid) from pg_constraint
-- where conrelid = 'public.notifications'::regclass and conname = 'notifications_kind_check';

-- Rollback:
-- begin;
-- delete from public.notifications where kind in ('review_queue', 'request_done');
-- alter table public.notifications drop constraint if exists notifications_kind_check;
-- alter table public.notifications add constraint notifications_kind_check check (kind in (
--   'comment', 'reply', 'mention', 'review', 'trade_match', 'wantlist_for_sale', 'follow'));
-- commit;
