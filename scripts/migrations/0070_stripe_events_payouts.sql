begin;

create table if not exists public.stripe_events (
  id text primary key,
  type text not null,
  livemode boolean not null,
  account text,
  received_at timestamptz not null default now(),
  claimed_at timestamptz,
  processed_at timestamptz,
  attempts integer not null default 0,
  last_error text
);
alter table public.stripe_events enable row level security;
revoke all on public.stripe_events from anon, authenticated;
grant select,insert,update on public.stripe_events to service_role;

create or replace function public.mkt_seller_config() returns jsonb language sql immutable as $$
 select '{"photos_required_cents":10000,"new_seller_max_price_cents":100000,"new_seller_max_listings":25,"new_seller_max_open_cents":200000,"promote_after_completed_orders":5,"new_seller_hold_days":14,"bank_change_hold_days":7}'::jsonb
$$;
create or replace function public.mkt_fee_config() returns jsonb language sql immutable security definer set search_path=public as $$
 select '{"platform_fee_bps":0,"processing_fee_bps":290,"processing_fee_fixed_cents":30,"reservation_minutes":35,"auto_deliver_days":14,"complete_after_delivery_days":3,"tracking_required_cents":5000,"ship_to_retention_days":120}'::jsonb
$$;

create or replace function public.mkt_claim_stripe_event(p_id text,p_type text,p_livemode boolean,p_account text) returns text
language plpgsql security definer set search_path=public as $$
declare
  e public.stripe_events%rowtype;
  inserted boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  insert into public.stripe_events (id, type, livemode, account, attempts, claimed_at)
  values (p_id, p_type, p_livemode, p_account, 1, now())
  on conflict do nothing
  returning * into e;
  inserted := found;
  if not inserted then
    select * into e
    from public.stripe_events
    where id = p_id
    for update;
    update public.stripe_events
    set attempts = attempts + 1
    where id = p_id;
  end if;
  if inserted or (
    e.processed_at is null
    and (e.last_error is not null or e.claimed_at < now() - interval '2 minutes')
  ) then
    update public.stripe_events
    set claimed_at = now(), last_error = null
    where id = p_id;
    return 'process';
  end if;
  return 'done';
end $$;
create or replace function public.mkt_finish_stripe_event(p_id text,p_error text) returns void
language plpgsql security definer set search_path=public as $$
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'service role required' using errcode='42501'; end if;
 update public.stripe_events set processed_at=case when p_error is null then now() else null end,last_error=p_error where id=p_id;
end $$;

create or replace function public.mkt_payout_due(p_limit int default 50) returns setof public.orders
language sql stable security definer set search_path=public as $$
 select o.* from public.orders o join public.seller_accounts s on s.user_id=o.seller_id
 where o.status='completed' and o.stripe_transfer_id is null and o.transferred_at is null and o.stripe_charge_id is not null
 and o.livemode=public.mkt_checkout_livemode() and s.payouts_enabled and not s.payouts_frozen and s.tier<>'suspended'
 and now() >= greatest(o.completed_at,case when s.tier='new' then o.paid_at+make_interval(days=>(public.mkt_seller_config()->>'new_seller_hold_days')::int) else o.completed_at end,
   coalesce(s.bank_changed_at+make_interval(days=>(public.mkt_seller_config()->>'bank_change_hold_days')::int),'-infinity'::timestamptz))
 order by o.completed_at limit greatest(0,least(coalesce(p_limit,50),200))
$$;

create or replace function public.order_mark_transferred(
  p_order uuid,
  p_transfer_id text,
  p_stripe_event_id text default null
) returns public.orders
language plpgsql security definer set search_path=public as $$
declare o public.orders%rowtype; before_row jsonb;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'service role required' using errcode='42501'; end if;
 select * into o from public.orders where id=p_order for update;
 if not found then raise exception 'order not found' using errcode='P0002'; end if;
 if o.stripe_transfer_id=p_transfer_id then return o; end if;
 if o.status <> 'completed' or o.stripe_transfer_id is not null then
   raise exception 'order cannot be transferred' using errcode = '55000';
 end if;
 before_row:=to_jsonb(o)-'ship_to';
 update public.orders set stripe_transfer_id=p_transfer_id,transferred_at=now() where id=p_order returning * into o;
 insert into public.marketplace_audit_log (
   actor_role, entity, entity_id, action, before, after, stripe_event_id
 ) values (
   'system', 'order', o.id, 'transferred', before_row, to_jsonb(o) - 'ship_to', p_stripe_event_id
 );
 return o;
end $$;
create or replace function public.mkt_mark_bank_changed(p_stripe_account_id text) returns void
language plpgsql security definer set search_path = public as $$
declare s public.seller_accounts%rowtype; before_row jsonb;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'service role required' using errcode='42501'; end if;
 select * into s from public.seller_accounts where stripe_account_id=p_stripe_account_id for update; if not found then return; end if;
 before_row := to_jsonb(s);
 update public.seller_accounts
 set bank_changed_at = now(), updated_at = now()
 where user_id = s.user_id
 returning * into s;
 insert into public.marketplace_audit_log (actor_role, entity, entity_id, action, before, after)
 values ('system', 'seller', s.user_id, 'bank_changed', before_row, to_jsonb(s));
end $$;
create or replace function public.mkt_audit_stripe(
  p_entity_id uuid,
  p_action text,
  p_event_id text
) returns void
language plpgsql security definer set search_path = public as $$
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'service role required' using errcode='42501'; end if;
 if p_entity_id is not null and exists (
   select 1 from public.orders where id = p_entity_id
 ) then
   insert into public.marketplace_audit_log (actor_role, entity, entity_id, action, stripe_event_id)
   values ('stripe', 'order', p_entity_id, p_action, p_event_id);
 end if;
end $$;

create or replace function public.order_sweep_db() returns jsonb language plpgsql security definer set search_path=public as $$
declare
  r record;
  delivered int := 0;
  completed int := 0;
  redacted int := 0;
  errors int := 0;
  cfg jsonb := public.mkt_fee_config();
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'service role required' using errcode='42501'; end if;
 for r in
   select id from public.orders
   where status = 'shipped'
     and shipped_at + make_interval(days => (cfg->>'auto_deliver_days')::int) <= now()
   order by shipped_at
   limit 200
 loop
  begin
    perform public.order_transition(r.id, 'delivered', null, 'system');
    delivered := delivered + 1;
  exception when others then
    errors := errors + 1;
    raise warning 'order_sweep_db delivery failed for order %: %', r.id, SQLERRM;
  end;
 end loop;
 for r in
   select id from public.orders
   where status = 'delivered'
     and delivered_at + make_interval(days => (cfg->>'complete_after_delivery_days')::int) <= now()
   order by delivered_at
   limit 200
 loop
  begin
    perform public.order_transition(r.id, 'completed', null, 'system');
    completed := completed + 1;
  exception when others then
    errors := errors + 1;
    raise warning 'order_sweep_db completion failed for order %: %', r.id, SQLERRM;
  end;
 end loop;
 for r in
   select id from public.orders
   where ship_to is not null
     and status in ('completed', 'refunded')
     and coalesce(completed_at, refunded_at)
       + make_interval(days => (cfg->>'ship_to_retention_days')::int) <= now()
   order by coalesce(completed_at, refunded_at)
   limit 200
 loop
  begin
    update public.orders
    set ship_to = null, ship_to_redacted_at = now()
    where id = r.id;
    redacted := redacted + 1;
  exception when others then
    errors := errors + 1;
    raise warning 'order_sweep_db redaction failed for order %: %', r.id, SQLERRM;
  end;
 end loop;
 return jsonb_build_object(
   'delivered', delivered,
   'completed', completed,
   'redacted', redacted,
   'errors', errors
 );
end $$;

revoke all on function public.mkt_seller_config() from public, anon, authenticated;
revoke all on function public.mkt_fee_config() from public, anon, authenticated;
revoke all on function public.mkt_claim_stripe_event(text, text, boolean, text) from public, anon, authenticated;
revoke all on function public.mkt_finish_stripe_event(text, text) from public, anon, authenticated;
revoke all on function public.mkt_payout_due(int) from public, anon, authenticated;
revoke all on function public.order_mark_transferred(uuid, text, text) from public, anon, authenticated;
revoke all on function public.mkt_mark_bank_changed(text) from public, anon, authenticated;
revoke all on function public.mkt_audit_stripe(uuid, text, text) from public, anon, authenticated;
revoke all on function public.order_sweep_db() from public, anon, authenticated;

grant execute on function public.mkt_seller_config() to service_role;
grant execute on function public.mkt_fee_config() to service_role;
grant execute on function public.mkt_claim_stripe_event(text, text, boolean, text) to service_role;
grant execute on function public.mkt_finish_stripe_event(text, text) to service_role;
grant execute on function public.mkt_payout_due(int) to service_role;
grant execute on function public.order_mark_transferred(uuid, text, text) to service_role;
grant execute on function public.mkt_mark_bank_changed(text) to service_role;
grant execute on function public.mkt_audit_stripe(uuid, text, text) to service_role;
grant execute on function public.order_sweep_db() to service_role;
commit;

-- Failure-mode checks (use disposable rows in begin/rollback):
-- Two concurrent mkt_claim_stripe_event calls for one id serialize; only the unfinished delivery processes.
-- order_mark_transferred with a different transfer id or a non-completed order raises 55000.
-- Authenticated callers cannot read stripe_events or execute any function above.
