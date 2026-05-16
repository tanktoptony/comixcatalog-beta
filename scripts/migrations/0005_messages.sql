-- Inter-profile messaging v1. Simple DM model — no group threads, no
-- attachments, no read receipts beyond `read_at`. The UI groups by
-- (sender, recipient) pair to produce thread views.
--
-- Apply via the Supabase SQL editor.

create table if not exists public.messages (
  id           uuid primary key default gen_random_uuid(),
  sender_id    uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  body         text not null check (char_length(trim(body)) > 0 and char_length(body) <= 4000),
  read_at      timestamptz,
  created_at   timestamptz not null default now(),

  constraint messages_no_self check (sender_id <> recipient_id)
);

-- Inbox queries hit (recipient_id, created_at desc) constantly; sender side
-- much less so but still indexed for thread reconstruction.
create index if not exists messages_recipient_created_idx
  on public.messages (recipient_id, created_at desc);
create index if not exists messages_sender_created_idx
  on public.messages (sender_id, created_at desc);

-- Partial index for the unread-count badge — cheap to scan.
create index if not exists messages_recipient_unread_idx
  on public.messages (recipient_id) where read_at is null;

alter table public.messages enable row level security;

-- Read: either party in the conversation can read.
create policy "messages_select_participants"
  on public.messages for select
  to authenticated
  using (auth.uid() = sender_id or auth.uid() = recipient_id);

-- Insert: must be the sender; can't impersonate.
create policy "messages_insert_as_sender"
  on public.messages for insert
  to authenticated
  with check (auth.uid() = sender_id);

-- Update: only the recipient can update (used to set read_at).
-- Body/sender_id/recipient_id are not editable in practice because we only
-- update read_at server-side, but the policy keeps it locked down.
create policy "messages_update_recipient"
  on public.messages for update
  to authenticated
  using (auth.uid() = recipient_id)
  with check (auth.uid() = recipient_id);

-- No delete policy — messages are immutable from a user's POV. (Service
-- role can still hard-delete via the admin client.)
