-- 0044_messages_lock_columns.sql
-- A message is one row that both people read. The recipient update policy
-- from 0005 limits which ROWS a recipient can update, not which COLUMNS, so a
-- recipient could rewrite body, sender_id or recipient_id. That lets a buyer
-- change what a seller "said", or make a message look like it came from
-- someone else. The browser only ever updates read_at
-- (src/app/inbox/[username]/page.js), so lock the table down to that column.
-- The service role keeps full access.

begin;

revoke update on public.messages from anon, authenticated;
grant update (read_at) on public.messages to authenticated;

commit;

-- Check (expect false, false, false, true):
-- select has_column_privilege('authenticated', 'public.messages', 'body', 'UPDATE')         as body,
--        has_column_privilege('authenticated', 'public.messages', 'sender_id', 'UPDATE')    as sender_id,
--        has_column_privilege('authenticated', 'public.messages', 'recipient_id', 'UPDATE') as recipient_id,
--        has_column_privilege('authenticated', 'public.messages', 'read_at', 'UPDATE')      as read_at;

-- Rollback:
-- revoke update (read_at) on public.messages from authenticated;
-- grant update on public.messages to authenticated;
