begin;

create or replace function public.mkt_buyer_config()
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'new_account_days', 7,
    'new_account_max_order_cents', 25000,
    'new_account_orders_per_day', 3,
    'orders_per_day', 10,
    'max_open_unpaid', 2,
    'abandon_limit', 3,
    'abandon_window_hours', 24,
    'cooldown_hours', 24
  )
$$;

create or replace function public.mkt_buyer_order_block(
  p_buyer uuid,
  p_total_cents int
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  cfg jsonb := public.mkt_buyer_config();
  account_created_at timestamptz;
  latest_abandonment timestamptz;
  is_new boolean;
  daily_limit int;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required'
      using errcode = '42501';
  end if;

  select
    u.created_at
  into
    account_created_at
  from auth.users u
  where u.id = p_buyer
    and u.email_confirmed_at is not null;

  if not found then
    return 'email_unverified';
  end if;

  if (
    select count(*)
    from public.orders o
    where o.buyer_id = p_buyer
      and o.status in ('created', 'awaiting_payment')
  ) >= (cfg->>'max_open_unpaid')::int then
    return 'too_many_open';
  end if;

  select
    max(o.cancelled_at)
  into
    latest_abandonment
  from public.orders o
  where o.buyer_id = p_buyer
    and o.status = 'cancelled'
    and o.paid_at is null
    and o.cancelled_at >= now() - make_interval(
      hours => (cfg->>'abandon_window_hours')::int
    )
  having count(*) >= (cfg->>'abandon_limit')::int;

  if latest_abandonment is not null
    and now() < latest_abandonment + make_interval(
      hours => (cfg->>'cooldown_hours')::int
    ) then
    return 'cooldown';
  end if;

  is_new := account_created_at > now() - make_interval(
    days => (cfg->>'new_account_days')::int
  );
  daily_limit := case
    when is_new then (cfg->>'new_account_orders_per_day')::int
    else (cfg->>'orders_per_day')::int
  end;

  if (
    select count(*)
    from public.orders o
    where o.buyer_id = p_buyer
      and o.created_at >= now() - interval '24 hours'
  ) >= daily_limit then
    return 'daily_limit';
  end if;

  if is_new
    and p_total_cents > (cfg->>'new_account_max_order_cents')::int then
    return 'new_account_amount';
  end if;

  return null;
end
$$;

alter table public.orders
  add column if not exists card_fingerprint text;

create index if not exists orders_card_fingerprint_idx
  on public.orders (card_fingerprint)
  where card_fingerprint is not null;

create table if not exists public.message_flags (
  message_id uuid not null
    references public.messages(id)
    on delete cascade,
  kind text not null
    check (kind in ('offplatform_payment')),
  terms text[] not null
    default '{}'::text[],
  created_at timestamptz not null
    default now(),
  primary key (message_id, kind)
);

alter table public.message_flags enable row level security;

create index if not exists message_flags_created_at_idx
  on public.message_flags (created_at);

create table if not exists public.order_flags (
  order_id uuid not null
    references public.orders(id)
    on delete cascade,
  kind text not null
    check (kind in ('shared_card', 'offplatform_terms')),
  detail jsonb not null
    default '{}'::jsonb,
  created_at timestamptz not null
    default now(),
  resolved_at timestamptz,
  resolved_by uuid
    references auth.users(id)
    on delete set null,
  primary key (order_id, kind)
);

alter table public.order_flags enable row level security;

create or replace function public.mkt_flag_shared_card(p_order uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.orders%rowtype;
  other_order uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required'
      using errcode = '42501';
  end if;

  select
    *
  into
    target
  from public.orders
  where id = p_order;

  if not found
    or target.card_fingerprint is null then
    return false;
  end if;

  select
    o.id
  into
    other_order
  from public.orders o
  where o.id <> target.id
    and o.buyer_id = target.seller_id
    and o.card_fingerprint = target.card_fingerprint
  order by o.created_at
  limit 1;

  if other_order is null then
    return false;
  end if;

  insert into public.order_flags (
    order_id,
    kind,
    detail
  )
  values (
    target.id,
    'shared_card',
    jsonb_build_object('other_order_id', other_order)
  )
  on conflict (order_id, kind) do nothing;

  return found;
end
$$;

create or replace function public.admin_resolve_order_flag(
  p_order uuid,
  p_kind text,
  p_admin uuid
)
returns public.order_flags
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.order_flags%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required'
      using errcode = '42501';
  end if;

  update public.order_flags
  set resolved_at = coalesce(resolved_at, now()),
      resolved_by = coalesce(resolved_by, p_admin)
  where order_id = p_order
    and kind = p_kind
  returning *
  into result;

  if not found then
    raise exception 'order flag not found'
      using errcode = 'P0002';
  end if;

  insert into public.marketplace_audit_log (
    actor_id,
    actor_role,
    entity,
    entity_id,
    action,
    after
  )
  values (
    p_admin,
    'admin',
    'order',
    p_order,
    'flag_resolved:' || p_kind,
    to_jsonb(result)
  );

  return result;
end
$$;

create or replace function public.order_create(
  p_buyer uuid,
  p_listing uuid,
  p_request_id text
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  l public.listings%rowtype;
  uc public.user_collections%rowtype;
  result public.orders%rowtype;
  cfg jsonb := public.mkt_fee_config();
  expiry timestamptz;
  item int4;
  shipping int4;
  total int4;
  platform_fee int4;
  processing_fee int4;
  seller_net int4;
  photos jsonb;
  expired_order uuid;
  block_code text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required'
      using errcode = '42501';
  end if;
  if p_buyer is null
    or p_listing is null then
    raise exception 'buyer and listing are required'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('mkt_buyer:' || p_buyer::text));

  select
    *
  into
    l
  from public.listings
  where id = p_listing
  for update;
  if not found then
    raise exception 'listing not found'
      using errcode = 'P0002';
  end if;
  if l.status = 'reserved' then
    select
      id
    into
      expired_order
    from public.orders
    where listing_id = l.id
      and status in ('created', 'awaiting_payment')
      and checkout_expires_at < now()
    order by created_at
    limit 1;
    if expired_order is not null then
      perform public.order_transition(
        expired_order,
        'cancelled',
        null,
        'system',
        '{}'::jsonb,
        p_request_id,
        null
      );
      select
        *
      into
        l
      from public.listings
      where id = p_listing
      for update;
    end if;
  end if;
  if l.status <> 'active' then
    raise exception 'listing is unavailable'
      using errcode = '55006';
  end if;
  if l.price_cents is null then
    raise exception 'listing is not priced'
      using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.profiles p
    where p.id = l.seller_id
      and p.username is not null
      and p.is_public is not false
      and p.show_for_sale is not false
  ) then
    raise exception 'seller profile is not visible'
      using errcode = '55006';
  end if;
  if p_buyer = l.seller_id then
    raise exception 'buyer cannot be seller'
      using errcode = '22023';
  end if;
  if exists (
    select 1
    from public.user_blocks
    where (
      blocker_id = p_buyer
      and blocked_id = l.seller_id
    )
      or (
        blocker_id = l.seller_id
        and blocked_id = p_buyer
      )
  ) then
    raise exception 'buyer and seller cannot trade'
      using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.profiles
    where id = p_buyer
  ) then
    raise exception 'buyer profile required'
      using errcode = '42501';
  end if;

  block_code := public.mkt_listing_checkout_block(l.id);
  if block_code is not null then
    raise exception 'listing not eligible: %', block_code
      using errcode = '55006';
  end if;

  select
    *
  into
    uc
  from public.user_collections
  where id = l.collection_id;
  if not found then
    raise exception 'collection item not found'
      using errcode = 'P0002';
  end if;

  item := l.price_cents;
  shipping := coalesce(l.shipping_cents, 0);
  total := item + shipping;
  block_code := public.mkt_buyer_order_block(p_buyer, total);
  if block_code is not null then
    raise exception 'buyer limit: %', block_code
      using errcode = '54000';
  end if;

  platform_fee := round(
    total * (cfg->>'platform_fee_bps')::numeric / 10000
  )::int;
  processing_fee := round(
    total * (cfg->>'processing_fee_bps')::numeric / 10000
  )::int + (cfg->>'processing_fee_fixed_cents')::int;
  seller_net := total - platform_fee - processing_fee;
  if seller_net < 0 then
    raise exception 'seller net cannot be negative'
      using errcode = '22023';
  end if;

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'storage_path', storage_path,
          'thumb_path', thumb_path,
          'kind', kind,
          'sort_order', sort_order,
          'width', width,
          'height', height,
          'bytes', bytes
        )
        order by sort_order,
          created_at
      ),
      '[]'::jsonb
    )
  into
    photos
  from public.listing_photos
  where collection_id = l.collection_id
    and owner_id = l.seller_id;

  expiry := now() + make_interval(
    mins => (cfg->>'reservation_minutes')::int
  );
  update public.listings
  set status = 'reserved',
      reserved_until = expiry,
      updated_at = now()
  where id = l.id;

  insert into public.orders (
    listing_id,
    buyer_id,
    seller_id,
    series_title,
    issue_number,
    release_year,
    publisher,
    variant_label,
    printing_name,
    gcd_issue_id,
    cover_path,
    condition,
    grade_numeric,
    slab_company,
    slab_cert_number,
    restored,
    signed,
    condition_notes,
    photo_keys,
    item_cents,
    shipping_cents,
    tax_cents,
    total_cents,
    platform_fee_cents,
    processing_fee_cents,
    seller_net_cents,
    checkout_expires_at,
    livemode
  )
  values (
    l.id,
    p_buyer,
    l.seller_id,
    l.series_title,
    l.issue_number,
    l.release_year,
    l.publisher,
    uc.variant_label,
    null,
    l.gcd_issue_id,
    l.cover_path,
    l.condition,
    l.grade_numeric,
    l.slab_company,
    l.slab_cert_number,
    l.restored,
    l.signed,
    l.condition_notes,
    photos,
    item,
    shipping,
    0,
    total,
    platform_fee,
    processing_fee,
    seller_net,
    expiry,
    public.mkt_checkout_livemode()
  )
  returning *
  into result;

  insert into public.marketplace_audit_log (
    actor_id,
    actor_role,
    entity,
    entity_id,
    action,
    before,
    after,
    request_id
  )
  values (
    p_buyer,
    'buyer',
    'order',
    result.id,
    'created',
    null,
    to_jsonb(result) - 'ship_to',
    p_request_id
  );
  return result;
end
$$;

drop function if exists public.admin_order_search(text, text, int, timestamptz);

create function public.admin_order_search(
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
  transferred_at timestamptz,
  flags text[]
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
    o.transferred_at,
    array(
      select distinct flag_kind
      from (
        select f.kind as flag_kind
        from public.order_flags f
        where f.order_id = o.id
          and f.resolved_at is null
        union all
        select 'offplatform_terms'::text
        where exists (
          select 1
          from public.messages m
          join public.message_flags mf
            on mf.message_id = m.id
          where m.order_id = o.id
            and mf.kind = 'offplatform_payment'
        )
      ) open_flags
      order by flag_kind
    )
  from public.orders o
  left join public.profiles b
    on b.id = o.buyer_id
  left join public.profiles s
    on s.id = o.seller_id
  where (
    p_status is null
    or p_status = ''
    or o.status = p_status
  )
    and (
      p_before is null
      or o.created_at < p_before
    )
    and (
      p_query is null
      or btrim(p_query) = ''
      or o.id::text ilike btrim(p_query) || '%'
      or b.username ilike '%' || btrim(p_query) || '%'
      or s.username ilike '%' || btrim(p_query) || '%'
      or o.series_title ilike '%' || btrim(p_query) || '%'
    )
  order by o.created_at desc
  limit greatest(
    1,
    least(coalesce(p_limit, 50), 100)
  )
$$;

revoke all on table public.message_flags from public, anon, authenticated;
revoke all on table public.order_flags from public, anon, authenticated;
revoke all on function public.mkt_buyer_config() from public, anon, authenticated;
revoke all on function public.mkt_buyer_order_block(uuid, int) from public, anon, authenticated;
revoke all on function public.mkt_flag_shared_card(uuid) from public, anon, authenticated;
revoke all on function public.admin_resolve_order_flag(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.admin_order_search(text, text, int, timestamptz) from public, anon, authenticated;

grant all on table public.message_flags to service_role;
grant all on table public.order_flags to service_role;
grant execute on function public.mkt_buyer_config() to service_role;
grant execute on function public.mkt_buyer_order_block(uuid, int) to service_role;
grant execute on function public.mkt_flag_shared_card(uuid) to service_role;
grant execute on function public.admin_resolve_order_flag(uuid, text, uuid) to service_role;
grant execute on function public.admin_order_search(text, text, int, timestamptz) to service_role;

commit;

-- Failure-mode checks live in tests/db/fraud.test.js: verified email, open-order and parallel limits,
-- abandoned checkout cooldown and expiry, age-based daily and amount limits, shared-card exact matching,
-- flag RLS, and admin search flag aggregation.
