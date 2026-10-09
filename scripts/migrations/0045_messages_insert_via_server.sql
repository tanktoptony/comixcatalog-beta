-- 0045_messages_insert_via_server.sql
-- Message sends now go through POST /api/messages, where the server enforces
-- blocks and rate limits before inserting with the service role. Remove both
-- the browser role's table privilege and its old insert policy so clients
-- cannot bypass those checks by writing to messages directly.

begin;

drop policy if exists "messages_insert_as_sender" on public.messages;
revoke insert on public.messages from anon, authenticated;

commit;

-- Check (expect false):
-- select has_table_privilege('authenticated','public.messages','INSERT');

-- Rollback:
-- grant insert on public.messages to authenticated;
-- create policy "messages_insert_as_sender"
--   on public.messages for insert
--   to authenticated
--   with check (auth.uid() = sender_id);
