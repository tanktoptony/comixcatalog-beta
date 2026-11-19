-- Attach a catalog issue or a specific collection copy to a message.
-- Inserts remain service-role only under migration 0045. Migration 0044
-- grants authenticated users UPDATE on read_at only, so these columns cannot
-- be changed by message participants.

begin;

alter table public.messages
  add column if not exists gcd_issue_id bigint null,
  add column if not exists collection_id uuid null references public.user_collections(id) on delete set null;

create index if not exists messages_gcd_issue_id_idx
  on public.messages (gcd_issue_id)
  where gcd_issue_id is not null;

commit;

-- Rollback:
-- drop index if exists public.messages_gcd_issue_id_idx;
-- alter table public.messages drop column if exists collection_id, drop column if exists gcd_issue_id;
