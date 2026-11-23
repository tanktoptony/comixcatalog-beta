-- 0117_message_reactions_realtime.sql
-- Slack-style emoji reactions on direct messages, and live delivery.
--
-- 1. message_reactions: one row per (message, member, emoji). Either person
--    in the conversation can read them. Writes only go through
--    POST /api/messages/reactions (service role), which checks that the
--    member is in the conversation, that neither side has blocked the other,
--    and that the emoji is on the picker's list (src/lib/emoji.js), the same
--    way message sends work since 0045.
-- 2. Add messages and message_reactions to the supabase_realtime
--    publication. The conversation view and inbox list already subscribe to
--    postgres_changes on messages, but the table was never published, so
--    new messages only showed up on the 10 s poll. Realtime applies the
--    tables' SELECT policies per subscriber, so members only receive rows
--    they can already read.

begin;

create table if not exists public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

create index if not exists message_reactions_user_created_idx
  on public.message_reactions (user_id, created_at desc);

alter table public.message_reactions enable row level security;

drop policy if exists "message_reactions_select_participants" on public.message_reactions;
create policy "message_reactions_select_participants"
  on public.message_reactions for select
  to authenticated
  using (exists (
    select 1 from public.messages m
    where m.id = message_reactions.message_id
      and (m.sender_id = auth.uid() or m.recipient_id = auth.uid())
  ));

revoke insert, update, delete on public.message_reactions from anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'message_reactions') then
    alter publication supabase_realtime add table public.message_reactions;
  end if;
end $$;

commit;

-- Checks:
-- select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by 1;
--   expect messages, message_reactions, user_collections
-- select has_table_privilege('authenticated', 'public.message_reactions', 'INSERT');  -- expect false

-- Rollback:
-- alter publication supabase_realtime drop table public.message_reactions;
-- alter publication supabase_realtime drop table public.messages;
-- drop table if exists public.message_reactions;
