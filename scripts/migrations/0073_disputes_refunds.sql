begin;

create table if not exists public.order_refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  stripe_refund_id text unique,
  amount_cents int not null check (amount_cents > 0),
  reason text not null,
  actor_id uuid references auth.users(id) on delete set null,
  actor_role text not null check (actor_role in ('buyer','seller','admin','system','stripe')),
  transfer_reversal_id text,
  status text not null default 'succeeded' check (status in ('pending','succeeded','failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_disputes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  kind text not null check (kind in ('not_received','not_as_described','chargeback')),
  opened_by uuid references auth.users(id) on delete set null,
  stripe_dispute_id text unique,
  status text not null default 'open' check (status in ('open','resolved_buyer','resolved_seller','withdrawn')),
  reason_text text not null check (char_length(reason_text) <= 2000),
  resolution_note text,
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null
);

create unique index if not exists order_disputes_one_open_per_order
  on public.order_disputes(order_id)
  where status = 'open';

create index if not exists order_refunds_order_idx
  on public.order_refunds(order_id, created_at);

create index if not exists order_disputes_order_idx
  on public.order_disputes(order_id, opened_at);

alter table public.order_refunds enable row level security;
alter table public.order_disputes enable row level security;
drop policy if exists order_refunds_parties_select
  on public.order_refunds;

create policy order_refunds_parties_select
  on public.order_refunds
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.orders o
      where o.id = order_id
        and auth.uid() in (o.buyer_id, o.seller_id)
    )
  );

drop policy if exists order_disputes_parties_select
  on public.order_disputes;

create policy order_disputes_parties_select
  on public.order_disputes
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.orders o
      where o.id = order_id
        and auth.uid() in (o.buyer_id, o.seller_id)
    )
  );

revoke all on public.order_refunds, public.order_disputes from anon, authenticated;
grant select (order_id, amount_cents, reason, status, created_at) on public.order_refunds to authenticated;
grant select on public.order_disputes to authenticated;

create or replace function public.mkt_apply_dispute_standing(p_seller uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  seller public.seller_accounts%rowtype;
  before_row jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  if (
    select count(*)
    from public.order_disputes d
    join public.orders o on o.id = d.order_id
    where o.seller_id = p_seller
      and d.status = 'resolved_buyer'
      and d.resolved_at >= now() - interval '90 days'
  ) < 2 then
    return;
  end if;

  select *
  into seller
  from public.seller_accounts
  where user_id = p_seller
  for update;

  if not found or seller.tier not in ('new', 'established') then
    return;
  end if;

  before_row := to_jsonb(seller);

  update public.seller_accounts
  set tier = 'limited',
      tier_reason = 'auto: disputes lost',
      updated_at = now()
  where user_id = p_seller
  returning * into seller;

  insert into public.marketplace_audit_log (
    actor_role,
    entity,
    entity_id,
    action,
    before,
    after
  ) values (
    'system',
    'seller',
    p_seller,
    'tier_limited_disputes',
    before_row,
    to_jsonb(seller)
  );
end
$$;

create or replace function public.order_record_refund(
  p_order uuid,
  p_amount int,
  p_reason text,
  p_actor uuid,
  p_actor_role text,
  p_stripe_refund_id text,
  p_transfer_reversal_id text
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.orders%rowtype;
  existing public.order_refunds%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  if p_actor_role not in ('seller', 'admin', 'system', 'stripe') then
    raise exception 'invalid actor role' using errcode = '22023';
  end if;

  if p_amount is null
    or p_amount <= 0
    or char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'valid refund amount and reason required' using errcode = '22023';
  end if;

  select *
  into o
  from public.orders
  where id = p_order
  for update;

  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;

  if p_stripe_refund_id is not null then
    select *
    into existing
    from public.order_refunds
    where stripe_refund_id = p_stripe_refund_id;
  end if;

  if existing.id is not null then
    return o;
  end if;

  if o.refunded_cents + p_amount > o.total_cents then
    raise exception 'refund exceeds order total' using errcode = '22023';
  end if;

  insert into public.order_refunds (
    order_id,
    stripe_refund_id,
    amount_cents,
    reason,
    actor_id,
    actor_role,
    transfer_reversal_id,
    status
  ) values (
    p_order,
    p_stripe_refund_id,
    p_amount,
    btrim(p_reason),
    p_actor,
    p_actor_role,
    p_transfer_reversal_id,
    'succeeded'
  );

  return public.order_transition(
    p_order,
    'refunded',
    p_actor,
    p_actor_role,
    jsonb_build_object('amount_cents', p_amount),
    null,
    null
  );
end
$$;

create or replace function public.order_open_dispute(
  p_order uuid,
  p_buyer uuid,
  p_kind text,
  p_reason text
)
returns public.order_disputes
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.orders%rowtype;
  d public.order_disputes%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  select *
  into o
  from public.orders
  where id = p_order
  for update;

  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;

  if p_buyer is distinct from o.buyer_id then
    raise exception 'buyer required' using errcode = '42501';
  end if;

  if p_kind not in ('not_received', 'not_as_described') then
    raise exception 'invalid dispute kind' using errcode = '22023';
  end if;

  if o.status not in ('shipped', 'delivered') then
    raise exception 'dispute window closed' using errcode = '55000';
  end if;

  if char_length(btrim(coalesce(p_reason, ''))) not between 10 and 2000 then
    raise exception 'reason must be 10 to 2000 characters' using errcode = '22023';
  end if;

  insert into public.order_disputes (
    order_id,
    kind,
    opened_by,
    reason_text
  ) values (
    p_order,
    p_kind,
    p_buyer,
    btrim(p_reason)
  ) returning * into d;

  perform public.order_transition(
    p_order,
    'disputed',
    p_buyer,
    'buyer',
    jsonb_build_object('reason', btrim(p_reason))
  );

  insert into public.marketplace_audit_log (
    actor_id,
    actor_role,
    entity,
    entity_id,
    action,
    after
  ) values (
    p_buyer,
    'buyer',
    'dispute',
    d.id,
    'dispute_opened',
    to_jsonb(d)
  );

  return d;
end
$$;

create or replace function public.order_record_chargeback(
  p_order uuid,
  p_stripe_dispute_id text,
  p_event_id text
)
returns public.order_disputes
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.orders%rowtype;
  d public.order_disputes%rowtype;
  superseded public.order_disputes%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  select *
  into d
  from public.order_disputes
  where stripe_dispute_id = p_stripe_dispute_id;

  if found then
    return d;
  end if;

  select *
  into o
  from public.orders
  where id = p_order
  for update;

  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;

  select *
  into superseded
  from public.order_disputes
  where order_id = p_order
    and status = 'open'
    and kind <> 'chargeback'
  for update;

  if found then
    update public.order_disputes
    set status = 'withdrawn',
        resolution_note = 'Superseded by a card chargeback',
        resolved_at = now()
    where id = superseded.id
    returning * into superseded;

    insert into public.marketplace_audit_log (
      actor_role,
      entity,
      entity_id,
      action,
      before,
      after,
      stripe_event_id
    ) values (
      'stripe',
      'dispute',
      superseded.id,
      'dispute_superseded_by_chargeback',
      to_jsonb(superseded) || jsonb_build_object('status', 'open', 'resolution_note', null, 'resolved_at', null),
      to_jsonb(superseded),
      p_event_id
    );
  end if;

  insert into public.order_disputes (
    order_id,
    kind,
    stripe_dispute_id,
    reason_text
  ) values (
    p_order,
    'chargeback',
    p_stripe_dispute_id,
    'Stripe chargeback'
  ) returning * into d;

  if o.status in ('paid', 'shipped', 'delivered', 'completed') then
    perform public.order_transition(
      p_order,
      'disputed',
      null,
      'stripe',
      jsonb_build_object('reason', 'Stripe chargeback'),
      null,
      p_event_id
    );
  end if;

  return d;
end
$$;

create or replace function public.order_close_chargeback(
  p_stripe_dispute_id text,
  p_won boolean,
  p_event_id text
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.order_disputes%rowtype;
  o public.orders%rowtype;
  amount int;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  select *
  into d
  from public.order_disputes
  where stripe_dispute_id = p_stripe_dispute_id
  for update;

  if not found then
    raise exception 'dispute not found' using errcode = 'P0002';
  end if;

  select *
  into o
  from public.orders
  where id = d.order_id
  for update;

  if d.status <> 'open' then
    return o;
  end if;

  update public.order_disputes
  set status = case when p_won then 'resolved_seller' else 'resolved_buyer' end,
      resolution_note = case when p_won
        then 'Stripe closed chargeback in seller favor'
        else 'Stripe closed chargeback in buyer favor'
      end,
      resolved_at = now()
  where id = d.id;
  if p_won then
    if o.status = 'disputed' then
      o := public.order_transition(o.id, 'completed', null, 'stripe', '{}', null, p_event_id);
    end if;
  else
    amount := o.total_cents - o.refunded_cents;
    if amount > 0 then
      o := public.order_transition(
        o.id,
        'refunded',
        null,
        'stripe',
        jsonb_build_object('amount_cents', amount),
        null,
        p_event_id
      );
    end if;
    perform public.mkt_apply_dispute_standing(o.seller_id);
  end if;

  insert into public.marketplace_audit_log (
    actor_role,
    entity,
    entity_id,
    action,
    stripe_event_id
  ) values (
    'stripe',
    'dispute',
    d.id,
    case when p_won then 'chargeback_won' else 'chargeback_lost' end,
    p_event_id
  );

  return o;
end
$$;

drop function if exists public.order_resolve_dispute(uuid, uuid, text, text, int);

create or replace function public.order_resolve_dispute(
  p_admin uuid,
  p_order uuid,
  p_outcome text,
  p_note text,
  p_refund_cents int default null,
  p_stripe_refund_id text default null
)
returns public.order_disputes
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.order_disputes%rowtype;
  o public.orders%rowtype;
  prior_status text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  if p_outcome not in ('buyer', 'seller', 'withdrawn')
    or char_length(btrim(coalesce(p_note, ''))) < 3 then
    raise exception 'valid outcome and note required' using errcode = '22023';
  end if;

  select *
  into d
  from public.order_disputes
  where order_id = p_order
    and status = 'open'
  for update;

  if not found then
    raise exception 'open dispute not found' using errcode = 'P0002';
  end if;

  select *
  into o
  from public.orders
  where id = p_order
  for update;

  if p_outcome = 'buyer' then
    -- The money must already have moved in Stripe; this only records it.
    if p_stripe_refund_id is null then
      raise exception 'buyer outcome requires a Stripe refund id' using errcode = '22023';
    end if;
    if not exists (
      select 1
      from public.order_refunds r
      where r.order_id = p_order
        and r.stripe_refund_id = p_stripe_refund_id
    ) then
      if p_refund_cents is null
        or p_refund_cents < 1
        or p_refund_cents > o.total_cents - o.refunded_cents then
        raise exception 'valid refund amount required' using errcode = '22023';
      end if;
      o := public.order_record_refund(p_order, p_refund_cents, p_note, p_admin, 'admin', p_stripe_refund_id, null);
    end if;
  elsif p_outcome = 'seller' then
    o := public.order_transition(p_order, 'completed', p_admin, 'admin', '{}');
  else
    if d.kind = 'chargeback' then
      raise exception 'chargeback cannot be withdrawn' using errcode = '22023';
    end if;
    select substring(a.action from '^transition:(.+)->disputed$')
    into prior_status
    from public.marketplace_audit_log a
    where a.entity = 'order'
      and a.entity_id = p_order
      and a.action like 'transition:%->disputed'
    order by a.id desc
    limit 1;
    if prior_status not in ('shipped', 'delivered') then
      raise exception 'prior status unavailable' using errcode = '55000';
    end if;
    update public.orders
    set status = prior_status
    where id = p_order
    returning * into o;
  end if;

  update public.order_disputes
  set status = case p_outcome
        when 'buyer' then 'resolved_buyer'
        when 'seller' then 'resolved_seller'
        else 'withdrawn'
      end,
      resolution_note = btrim(p_note),
      resolved_at = now(),
      resolved_by = p_admin
  where id = d.id
  returning * into d;

  insert into public.marketplace_audit_log (
    actor_id,
    actor_role,
    entity,
    entity_id,
    action,
    after
  ) values (
    p_admin,
    'admin',
    'dispute',
    d.id,
    'dispute_resolved_' || p_outcome,
    to_jsonb(d)
  );

  if p_outcome = 'buyer' then
    perform public.mkt_apply_dispute_standing(o.seller_id);
  end if;

  return d;
end
$$;

create or replace function public.mkt_payout_due(p_limit int default 50)
returns setof public.orders
language sql
stable
security definer
set search_path = public
as $$
  select o.*
  from public.orders o
  join public.seller_accounts s on s.user_id = o.seller_id
  where o.status = 'completed'
    and o.stripe_transfer_id is null
    and o.transferred_at is null
    and o.stripe_charge_id is not null
    and not exists (
      select 1
      from public.order_disputes d
      where d.order_id = o.id
        and d.status = 'open'
    )
    and o.livemode = public.mkt_checkout_livemode()
    and s.payouts_enabled
    and not s.payouts_frozen
    and s.tier <> 'suspended'
    and now() >= greatest(
      o.completed_at,
      case when s.tier = 'new'
        then o.paid_at + make_interval(days => (public.mkt_seller_config()->>'new_seller_hold_days')::int)
        else o.completed_at
      end,
      coalesce(
        s.bank_changed_at + make_interval(days => (public.mkt_seller_config()->>'bank_change_hold_days')::int),
        '-infinity'::timestamptz
      )
    )
  order by o.completed_at
  limit greatest(0, least(coalesce(p_limit, 50), 200))
$$;

create or replace function public.admin_order_search(
  p_query text default null,
  p_status text default null,
  p_limit int default 50,
  p_before timestamptz default null
)
returns table (
  id uuid,
  created_at timestamptz,
  buyer_username text,
  seller_username text,
  series_title text,
  issue_number text,
  total_cents int,
  status text,
  open_dispute boolean,
  refunded_cents int,
  transferred_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    o.id,
    o.created_at,
    b.username,
    s.username,
    o.series_title,
    o.issue_number,
    o.total_cents,
    o.status,
    exists (
      select 1
      from public.order_disputes d
      where d.order_id = o.id
        and d.status = 'open'
    ),
    o.refunded_cents,
    o.transferred_at
  from public.orders o
  left join public.profiles b on b.id = o.buyer_id
  left join public.profiles s on s.id = o.seller_id
  where (p_status is null or p_status = '' or o.status = p_status)
    and (p_before is null or o.created_at < p_before)
    and (
      p_query is null
      or btrim(p_query) = ''
      or o.id::text ilike btrim(p_query) || '%'
      or b.username ilike '%' || btrim(p_query) || '%'
      or s.username ilike '%' || btrim(p_query) || '%'
      or o.series_title ilike '%' || btrim(p_query) || '%'
    )
  order by o.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 100))
$$;

create or replace function public.mkt_promote_seller_after_completion() returns trigger
language plpgsql security definer set search_path=public as $$
declare seller public.seller_accounts%rowtype; cfg jsonb:=public.mkt_seller_config(); old_seller jsonb;
begin
  if new.status='completed' and old.status is distinct from 'completed' then
    update public.seller_accounts set completed_orders=completed_orders+1,updated_at=now() where user_id=new.seller_id returning * into seller;
    old_seller:=to_jsonb(seller);
    if seller.tier='new' and seller.completed_orders >= (cfg->>'promote_after_completed_orders')::int
      and not exists(select 1 from public.orders o where o.seller_id=new.seller_id and o.status='disputed')
      and not exists(select 1 from public.order_disputes d join public.orders o on o.id=d.order_id where o.seller_id=new.seller_id and d.status='resolved_buyer') then
      update public.seller_accounts set tier='established',tier_reason='auto: completed orders',updated_at=now() where user_id=new.seller_id returning * into seller;
      insert into public.marketplace_audit_log(actor_role,entity,entity_id,action,before,after) values('system','seller',new.seller_id,'tier_promoted',old_seller,to_jsonb(seller));
    end if;
  end if;
  return new;
end $$;

revoke all on function public.mkt_apply_dispute_standing(uuid) from public, anon, authenticated;
revoke all on function public.order_record_refund(uuid, int, text, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.order_open_dispute(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.order_record_chargeback(uuid, text, text) from public, anon, authenticated;
revoke all on function public.order_close_chargeback(text, boolean, text) from public, anon, authenticated;
revoke all on function public.order_resolve_dispute(uuid, uuid, text, text, int, text) from public, anon, authenticated;
revoke all on function public.admin_order_search(text, text, int, timestamptz) from public, anon, authenticated;

grant execute on function public.mkt_apply_dispute_standing(uuid) to service_role;
grant execute on function public.order_record_refund(uuid, int, text, uuid, text, text, text) to service_role;
grant execute on function public.order_open_dispute(uuid, uuid, text, text) to service_role;
grant execute on function public.order_record_chargeback(uuid, text, text) to service_role;
grant execute on function public.order_close_chargeback(text, boolean, text) to service_role;
grant execute on function public.order_resolve_dispute(uuid, uuid, text, text, int, text) to service_role;
grant execute on function public.admin_order_search(text, text, int, timestamptz) to service_role;

-- Failure-mode checks live in tests/db/disputes.test.js: window and party guards,
-- concurrent refund bounds, webhook replay, payout exclusion, standing, withdrawal,
-- promotion, and RLS visibility. Search uses ILIKE because this table is small.
commit;
