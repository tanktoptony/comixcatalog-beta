-- Marketplace transactions PR d: order threads and transactional email claims.

begin;

alter table public.messages
  add column if not exists order_id uuid references public.orders(id) on delete restrict;
alter table public.messages
  add column if not exists is_system boolean not null default false;
grant select, insert on public.messages to service_role;

create index if not exists messages_order_created_idx
  on public.messages (order_id, created_at);

create or replace function public.mkt_validate_order_message() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.order_id is null then return new; end if;
  if not exists (
    select 1 from public.orders o
    where o.id = new.order_id
      and ((new.sender_id = o.buyer_id and new.recipient_id = o.seller_id)
        or (new.sender_id = o.seller_id and new.recipient_id = o.buyer_id))
  ) then
    raise exception 'order messages require both order parties' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists messages_validate_order_party on public.messages;
create trigger messages_validate_order_party before insert or update of order_id, sender_id, recipient_id
  on public.messages for each row execute function public.mkt_validate_order_message();

-- Messages still cascade with their sender or recipient. Accounts that are a
-- party to an order cannot be deleted because orders uses restrictive user
-- foreign keys, so order-thread messages survive account cleanup.

create table if not exists public.order_email_log (
  order_id uuid not null references public.orders(id) on delete restrict,
  event text not null,
  recipient_id uuid not null references auth.users(id) on delete restrict,
  sent_at timestamptz not null default now(),
  primary key (order_id, event, recipient_id)
);

alter table public.order_email_log enable row level security;
revoke all on public.order_email_log from public, anon, authenticated;
grant all on public.order_email_log to service_role;

create or replace function public.mkt_claim_order_email(
  p_order uuid,
  p_event text,
  p_recipient uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  insert into public.order_email_log (order_id, event, recipient_id)
  values (p_order, p_event, p_recipient)
  on conflict do nothing;

  return found;
end;
$$;

revoke all on function public.mkt_claim_order_email(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.mkt_claim_order_email(uuid, text, uuid) to service_role;

commit;

-- Failure-mode checks:
-- set local role authenticated; select public.mkt_claim_order_email(...); -- 42501
-- select public.mkt_claim_order_email(order, event, recipient); -- true, then false
-- insert an order message with a missing order id; -- foreign-key failure
