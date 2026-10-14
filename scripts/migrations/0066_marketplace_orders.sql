-- Marketplace transactions PR a: order core, without payment routes.

begin;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references public.listings(id) on delete set null,
  buyer_id uuid not null references auth.users(id) on delete restrict,
  seller_id uuid not null references auth.users(id) on delete restrict,
  sold_item_id uuid references public.sold_items(id) on delete set null,
  series_title text not null,
  issue_number text,
  release_year int4,
  publisher text,
  variant_label text,
  printing_name text,
  gcd_issue_id int4,
  cover_path text,
  condition text,
  grade_numeric numeric(3,1),
  slab_company text,
  slab_cert_number text,
  restored boolean not null default false,
  signed boolean not null default false,
  condition_notes text,
  photo_keys jsonb not null default '[]'::jsonb,
  item_cents int4 not null check (item_cents >= 0),
  shipping_cents int4 not null check (shipping_cents >= 0),
  tax_cents int4 not null check (tax_cents >= 0),
  total_cents int4 not null check (total_cents >= 0),
  platform_fee_cents int4 not null check (platform_fee_cents >= 0),
  processing_fee_cents int4 not null check (processing_fee_cents >= 0),
  seller_net_cents int4 not null check (seller_net_cents >= 0),
  refunded_cents int4 not null default 0 check (refunded_cents >= 0 and refunded_cents <= total_cents),
  currency text not null default 'usd' check (currency = 'usd'),
  livemode boolean not null default false,
  status text not null default 'created' check (status in (
    'created','awaiting_payment','paid','shipped','delivered','completed','cancelled','refunded','disputed'
  )),
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text unique,
  stripe_charge_id text unique,
  stripe_transfer_id text unique,
  checkout_expires_at timestamptz,
  ship_to jsonb,
  ship_to_redacted_at timestamptz,
  tracking_carrier text check (tracking_carrier in ('usps','ups','fedex','dhl','other')),
  tracking_number text,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  shipped_at timestamptz,
  delivered_at timestamptz,
  delivered_by text check (delivered_by in ('buyer','system')),
  completed_at timestamptz,
  cancelled_at timestamptz,
  refunded_at timestamptz,
  payout_eligible_at timestamptz,
  transferred_at timestamptz,
  check (buyer_id <> seller_id),
  check (total_cents = item_cents + shipping_cents + tax_cents),
  check (seller_net_cents = total_cents - tax_cents - platform_fee_cents - processing_fee_cents)
);

create unique index if not exists orders_one_open_per_listing on public.orders (listing_id)
  where status in ('created','awaiting_payment','paid');
create index if not exists orders_buyer_created_idx on public.orders (buyer_id, created_at desc);
create index if not exists orders_seller_created_idx on public.orders (seller_id, created_at desc);
create index if not exists orders_checkout_sweep_idx on public.orders (status, checkout_expires_at)
  where status in ('created','awaiting_payment');
create index if not exists orders_shipped_sweep_idx on public.orders (status, shipped_at)
  where status = 'shipped';
create index if not exists orders_delivered_sweep_idx on public.orders (status, delivered_at)
  where status = 'delivered';

alter table public.orders enable row level security;
drop policy if exists orders_select_parties on public.orders;
create policy orders_select_parties on public.orders for select to authenticated
  using (auth.uid() in (buyer_id, seller_id));

revoke all on public.orders from anon, authenticated;
grant select (
  id, listing_id, buyer_id, seller_id, sold_item_id,
  series_title, issue_number, release_year, publisher, variant_label, printing_name,
  gcd_issue_id, cover_path, condition, grade_numeric, slab_company, slab_cert_number,
  restored, signed, condition_notes, photo_keys, item_cents, shipping_cents, tax_cents,
  total_cents, platform_fee_cents, processing_fee_cents, seller_net_cents, refunded_cents,
  currency, livemode, status, stripe_checkout_session_id, stripe_payment_intent_id,
  stripe_charge_id, stripe_transfer_id, checkout_expires_at, ship_to_redacted_at,
  tracking_carrier, tracking_number, created_at, paid_at, shipped_at, delivered_at,
  delivered_by, completed_at, cancelled_at, refunded_at, payout_eligible_at, transferred_at
) on public.orders to authenticated;
grant all on public.orders to service_role;

create table if not exists public.marketplace_audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid,
  actor_role text not null check (actor_role in ('buyer','seller','admin','system','stripe')),
  entity text not null check (entity in ('order','listing','seller','refund','dispute','feedback')),
  entity_id uuid not null,
  action text not null,
  before jsonb,
  after jsonb,
  request_id text,
  stripe_event_id text
);
alter table public.marketplace_audit_log enable row level security;
revoke all on public.marketplace_audit_log from public, anon, authenticated;
grant all on public.marketplace_audit_log to service_role;
grant usage, select on sequence public.marketplace_audit_log_id_seq to service_role;

create or replace function public.mkt_audit_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'marketplace audit log is immutable' using errcode = '55000';
end;
$$;
drop trigger if exists marketplace_audit_log_immutable on public.marketplace_audit_log;
create trigger marketplace_audit_log_immutable before update or delete on public.marketplace_audit_log
  for each row execute function public.mkt_audit_immutable();
drop trigger if exists marketplace_audit_log_no_truncate on public.marketplace_audit_log;
create trigger marketplace_audit_log_no_truncate before truncate on public.marketplace_audit_log
  for each statement execute function public.mkt_audit_immutable();

create or replace function public.mkt_fee_config() returns jsonb
language sql immutable security definer set search_path = public as $$
  select '{"platform_fee_bps":0,"processing_fee_bps":290,"processing_fee_fixed_cents":30,"reservation_minutes":30,"auto_deliver_days":14,"complete_after_delivery_days":3,"tracking_required_cents":5000}'::jsonb
$$;

create or replace function public.mkt_seller_can_sell(p_seller uuid) returns boolean
language sql stable security definer set search_path = public as $$
  -- PR b replaces this hook with Stripe onboarding and tier checks.
  select p_seller is not null
$$;

create or replace function public.order_ship_to(p_order uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select o.ship_to from public.orders o
  where o.id = p_order and o.seller_id = auth.uid()
    and o.status in ('paid','shipped','delivered','completed','refunded','disputed')
    and o.ship_to_redacted_at is null
$$;

alter table public.sold_items add column if not exists order_id uuid;
alter table public.sold_items drop constraint if exists sold_items_order_id_fkey;
alter table public.sold_items add constraint sold_items_order_id_fkey
  foreign key (order_id) references public.orders(id) on delete set null;
-- 0052 declared these checks inline; drop them by definition in case the generated names differ.
do $$
declare c record;
begin
  for c in select conname from pg_constraint
    where conrelid = 'public.sold_items'::regclass and contype = 'c'
      and (pg_get_constraintdef(oid) like '%sold_via%' or pg_get_constraintdef(oid) like '%pending_buyer%')
  loop
    execute format('alter table public.sold_items drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.sold_items drop constraint if exists sold_items_sold_via_check;
alter table public.sold_items add constraint sold_items_sold_via_check
  check (sold_via in ('comixcatalog_message','offsite','comixcatalog_order'));
-- order_pending: copy sold through checkout, moves to the buyer only via order_transition
-- (so /purchases confirm/dispute, inbox prompts and expirePendingSales.js never see it).
-- refunded: order refunded before delivery; the copy never moves to the buyer.
alter table public.sold_items drop constraint if exists sold_items_status_check;
alter table public.sold_items add constraint sold_items_status_check
  check (status in ('recorded','pending_buyer','confirmed','disputed','expired','order_pending','refunded'));

drop function if exists public.mark_item_sold(uuid, uuid, numeric, text, uuid);
create or replace function public.mark_item_sold(
  p_seller_id uuid, p_collection_item_id uuid, p_sale_price numeric, p_sold_via text,
  p_buyer_id uuid default null, p_order_id uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  item public.user_collections%rowtype;
  active_listing public.listings%rowtype;
  snap record;
  sold_id uuid;
  photo_keys jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'service role required' using errcode = '42501'; end if;
  if p_sale_price is null or p_sale_price <= 0 or p_sale_price > 99999999.99 then raise exception 'sale price must be greater than zero' using errcode = '22023'; end if;
  if p_sold_via not in ('comixcatalog_message','offsite','comixcatalog_order') then raise exception 'invalid sold via value' using errcode = '22023'; end if;
  if p_buyer_id = p_seller_id then raise exception 'seller cannot be the buyer' using errcode = '22023'; end if;
  if p_buyer_id is not null and not exists (select 1 from public.profiles where id = p_buyer_id) then raise exception 'buyer not found' using errcode = 'P0002'; end if;
  if p_sold_via = 'comixcatalog_order' and (p_order_id is null or p_buyer_id is null or coalesce(current_setting('cc.order_tx', true), '') <> 'on') then raise exception 'order sales go through order_transition' using errcode = '42501'; end if;
  -- Order sales were block-checked at order_create; a block made after payment must not strand a paid order.
  if p_sold_via <> 'comixcatalog_order' and p_buyer_id is not null and exists (select 1 from public.user_blocks where (blocker_id = p_seller_id and blocked_id = p_buyer_id) or (blocker_id = p_buyer_id and blocked_id = p_seller_id)) then raise exception 'buyer and seller cannot trade' using errcode = '42501'; end if;

  select * into item from public.user_collections where id = p_collection_item_id and user_id = p_seller_id for update;
  if not found then raise exception 'collection item not found' using errcode = 'P0002'; end if;
  if item.status <> 'for_sale' then raise exception 'collection item is not for sale' using errcode = '22023'; end if;
  select * into active_listing from public.listings where collection_id = item.id and seller_id = p_seller_id and status in ('draft','active','reserved') order by created_at desc limit 1 for update;
  if item.gcd_issue_id is not null then select * into snap from public.listing_snapshot(item.gcd_issue_id);
  else select c.series_title, c.issue_number, c.release_year, c.publisher into snap from public.comics c where c.id = item.comic_id; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'storage_path', lp.storage_path, 'thumb_path', lp.thumb_path, 'kind', lp.kind,
    'sort_order', lp.sort_order, 'width', lp.width, 'height', lp.height, 'bytes', lp.bytes
  ) order by lp.sort_order, lp.created_at), '[]'::jsonb) into photo_keys
  from public.listing_photos lp where lp.collection_id = item.id and lp.owner_id = p_seller_id;
  insert into public.sold_items (
    seller_id, buyer_id, collection_item_id, listing_id, order_id, gcd_issue_id, comic_id,
    series_title, issue_number, release_year, publisher, variant_label, copy_number,
    condition, grade_numeric, slab_company, slab_cert_number, notes, purchase_price,
    market_value, user_cover_url, seller_photo_keys, listing_snapshot, sale_price, sold_via, status
  ) values (
    p_seller_id, p_buyer_id, item.id, active_listing.id, p_order_id, item.gcd_issue_id, item.comic_id,
    coalesce(active_listing.series_title, snap.series_title, 'Untitled'), coalesce(active_listing.issue_number, snap.issue_number),
    coalesce(active_listing.release_year, snap.release_year), coalesce(active_listing.publisher, snap.publisher),
    item.variant_label, item.copy_number, item.condition, item.grade_numeric, item.slab_company,
    item.slab_cert_number, item.notes, item.purchase_price, item.market_value, item.user_cover_url,
    photo_keys, case when active_listing.id is null then '{}'::jsonb else to_jsonb(active_listing) - 'seller_id' - 'collection_id' end,
    p_sale_price, p_sold_via, case when p_sold_via = 'comixcatalog_order' then 'order_pending' when p_buyer_id is null then 'recorded' else 'pending_buyer' end
  ) returning id into sold_id;
  if active_listing.id is not null then update public.listings set status = 'sold', sold_at = now(), updated_at = now() where id = active_listing.id; end if;
  delete from public.user_collections where id = item.id and user_id = p_seller_id;
  if not found then raise exception 'collection item changed during sale' using errcode = '40001'; end if;
  return sold_id;
end;
$$;

-- Same body as 0060, except an order_pending sale can only be transferred from inside
-- order_transition (cc.order_tx), never through /api/purchases/[id]/confirm.
create or replace function public.confirm_sale_transfer(p_sale_id uuid, p_buyer_id uuid)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  sale public.sold_items%rowtype;
  new_collection_id uuid;
  next_copy int4;
  photo jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  select * into sale from public.sold_items where id = p_sale_id for update;
  if not found then raise exception 'purchase not found' using errcode = 'P0002'; end if;
  if sale.buyer_id is distinct from p_buyer_id then raise exception 'buyer required' using errcode = '42501'; end if;
  if not (sale.status = 'pending_buyer'
    or (sale.status = 'order_pending' and coalesce(current_setting('cc.order_tx', true), '') = 'on')) then
    raise exception 'purchase is not pending' using errcode = '22023';
  end if;

  select coalesce(max(copy_number), 0) + 1 into next_copy
  from public.user_collections where user_id = p_buyer_id
    and ((sale.gcd_issue_id is not null and gcd_issue_id = sale.gcd_issue_id)
      or (sale.comic_id is not null and comic_id = sale.comic_id));

  insert into public.user_collections (
    user_id, gcd_issue_id, comic_id, status, variant_label, copy_number, condition,
    grade_numeric, slab_company, slab_cert_number, purchase_price, user_cover_url
  ) values (
    p_buyer_id, sale.gcd_issue_id, sale.comic_id, 'owned', sale.variant_label, next_copy,
    sale.condition, sale.grade_numeric, sale.slab_company, sale.slab_cert_number,
    sale.sale_price, sale.user_cover_url
  ) returning id into new_collection_id;

  for photo in select value from jsonb_array_elements(sale.seller_photo_keys) loop
    insert into public.listing_photos (
      listing_id, collection_id, owner_id, storage_path, thumb_path, width, height, bytes, kind, sort_order
    ) values (
      null, new_collection_id, p_buyer_id, photo->>'storage_path', photo->>'thumb_path',
      nullif(photo->>'width','')::int, nullif(photo->>'height','')::int,
      nullif(photo->>'bytes','')::int, photo->>'kind', coalesce((photo->>'sort_order')::int, 0)
    );
  end loop;

  delete from public.user_collections where user_id = p_buyer_id and status = 'wishlist'
    and ((sale.gcd_issue_id is not null and gcd_issue_id = sale.gcd_issue_id)
      or (sale.comic_id is not null and comic_id = sale.comic_id));
  update public.sold_items set status = 'confirmed' where id = sale.id;
  return new_collection_id;
end;
$$;

-- Seller refunds before shipping: the book never left, so it goes back in their library.
create or replace function public.mkt_restore_seller_copy(p_sale_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  sale public.sold_items%rowtype;
  new_collection_id uuid;
  next_copy int4;
  photo jsonb;
begin
  if coalesce(current_setting('cc.order_tx', true), '') <> 'on' then
    raise exception 'order transition required' using errcode = '42501';
  end if;
  select * into sale from public.sold_items where id = p_sale_id for update;
  if not found or sale.status <> 'order_pending' then return null; end if;
  select coalesce(max(copy_number), 0) + 1 into next_copy
  from public.user_collections where user_id = sale.seller_id
    and ((sale.gcd_issue_id is not null and gcd_issue_id = sale.gcd_issue_id)
      or (sale.comic_id is not null and comic_id = sale.comic_id));
  insert into public.user_collections (
    user_id, gcd_issue_id, comic_id, status, variant_label, copy_number, condition,
    grade_numeric, slab_company, slab_cert_number, notes, purchase_price, market_value, user_cover_url
  ) values (
    sale.seller_id, sale.gcd_issue_id, sale.comic_id, 'owned', sale.variant_label, next_copy,
    sale.condition, sale.grade_numeric, sale.slab_company, sale.slab_cert_number, sale.notes,
    sale.purchase_price, sale.market_value, sale.user_cover_url
  ) returning id into new_collection_id;
  for photo in select value from jsonb_array_elements(sale.seller_photo_keys) loop
    insert into public.listing_photos (
      listing_id, collection_id, owner_id, storage_path, thumb_path, width, height, bytes, kind, sort_order
    ) values (
      null, new_collection_id, sale.seller_id, photo->>'storage_path', photo->>'thumb_path',
      nullif(photo->>'width','')::int, nullif(photo->>'height','')::int,
      nullif(photo->>'bytes','')::int, photo->>'kind', coalesce((photo->>'sort_order')::int, 0)
    );
  end loop;
  update public.sold_items set status = 'refunded' where id = sale.id;
  return new_collection_id;
end;
$$;

create or replace function public.mkt_guard_collection_open_order() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if current_setting('cc.order_tx', true) = 'on' then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  if exists (
    select 1 from public.listings l join public.orders o on o.listing_id = l.id
    where l.collection_id = old.id and o.status in ('created','awaiting_payment','paid')
  ) then raise exception 'copy has an open order' using errcode = '55006'; end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;
drop trigger if exists user_collections_order_guard on public.user_collections;
create trigger user_collections_order_guard before delete or update of gcd_issue_id, status, user_id
  on public.user_collections for each row execute function public.mkt_guard_collection_open_order();

-- TRANSITIONS_BEGIN
-- created|awaiting_payment|system
-- created|cancelled|buyer,seller,system
-- awaiting_payment|cancelled|buyer,seller,system
-- awaiting_payment|paid|stripe
-- cancelled|refunded|stripe
-- paid|shipped|seller
-- paid|refunded|seller,admin
-- shipped|delivered|buyer,system
-- delivered|completed|system
-- shipped|disputed|buyer,stripe
-- delivered|disputed|buyer,stripe
-- paid|disputed|stripe
-- completed|disputed|stripe
-- disputed|completed|admin,stripe
-- disputed|refunded|admin,stripe
-- shipped|refunded|admin,stripe
-- delivered|refunded|admin,stripe
-- completed|refunded|admin,stripe
-- TRANSITIONS_END

create or replace function public.order_transition(
  p_order uuid, p_to text, p_actor_id uuid, p_actor_role text,
  p_payload jsonb default '{}'::jsonb, p_request_id text default null,
  p_stripe_event_id text default null
) returns public.orders language plpgsql security definer set search_path = public as $$
declare
  o public.orders%rowtype;
  before_row jsonb;
  allowed boolean;
  amount int4;
  cfg jsonb := public.mkt_fee_config();
  sold_id uuid;
  collection_item_id uuid;
  tracking text;
  payment_amount int4;
  payment_livemode boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'service role required' using errcode = '42501'; end if;
  if p_actor_role is null or p_actor_role not in ('buyer','seller','admin','system','stripe') then raise exception 'invalid actor role' using errcode = '22023'; end if;
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'order not found' using errcode = 'P0002'; end if;
  if p_actor_role = 'buyer' and p_actor_id is distinct from o.buyer_id then raise exception 'buyer required' using errcode = '42501'; end if;
  if p_actor_role = 'seller' and p_actor_id is distinct from o.seller_id then raise exception 'seller required' using errcode = '42501'; end if;
  if o.status = p_to and (p_stripe_event_id is null or p_stripe_event_id = (
    select a.stripe_event_id from public.marketplace_audit_log a where a.entity = 'order' and a.entity_id = o.id
      and a.action like 'transition:%->' || p_to order by a.id desc limit 1
  )) then return o; end if;

  select exists (select 1 from (values
    -- TRANSITION_VALUES_BEGIN
    ('created','awaiting_payment','system'), ('created','cancelled','buyer'), ('created','cancelled','seller'), ('created','cancelled','system'),
    ('awaiting_payment','cancelled','buyer'), ('awaiting_payment','cancelled','seller'), ('awaiting_payment','cancelled','system'), ('awaiting_payment','paid','stripe'),
    ('cancelled','refunded','stripe'), ('paid','shipped','seller'), ('paid','refunded','seller'), ('paid','refunded','admin'),
    ('shipped','delivered','buyer'), ('shipped','delivered','system'), ('delivered','completed','system'),
    ('shipped','disputed','buyer'), ('shipped','disputed','stripe'), ('delivered','disputed','buyer'), ('delivered','disputed','stripe'),
    ('paid','disputed','stripe'), ('completed','disputed','stripe'), ('disputed','completed','admin'), ('disputed','completed','stripe'),
    ('disputed','refunded','admin'), ('disputed','refunded','stripe'), ('shipped','refunded','admin'), ('shipped','refunded','stripe'),
    ('delivered','refunded','admin'), ('delivered','refunded','stripe'), ('completed','refunded','admin'), ('completed','refunded','stripe')
    -- TRANSITION_VALUES_END
  ) as t(f,t,r) where t.f = o.status and t.t = p_to and t.r = p_actor_role) into allowed;
  if not allowed then raise exception 'illegal transition % -> % for %', o.status, p_to, p_actor_role using errcode = '55000'; end if;
  before_row := to_jsonb(o) - 'ship_to';

  if p_to = 'awaiting_payment' then
    if nullif(p_payload->>'stripe_checkout_session_id','') is null then raise exception 'stripe checkout session id required' using errcode = '22023'; end if;
    update public.orders set status = p_to, stripe_checkout_session_id = p_payload->>'stripe_checkout_session_id' where id = o.id returning * into o;
  elsif p_to = 'cancelled' then
    update public.orders set status = p_to, cancelled_at = now() where id = o.id returning * into o;
    update public.listings set status = 'active', reserved_until = null, updated_at = now() where id = o.listing_id and status = 'reserved';
  elsif p_to = 'paid' then
    begin
      payment_amount := (p_payload->>'amount_total')::int4;
      payment_livemode := (p_payload->>'livemode')::boolean;
    exception when others then
      raise exception 'payment details do not match order' using errcode = '22023';
    end;
    if p_payload->>'stripe_checkout_session_id' is distinct from o.stripe_checkout_session_id
      or payment_amount is distinct from o.total_cents
      or p_payload->>'currency' is distinct from 'usd'
      or payment_livemode is distinct from o.livemode
    then raise exception 'payment details do not match order' using errcode = '22023'; end if;
    select collection_id into collection_item_id from public.listings where id = o.listing_id;
    if collection_item_id is null then raise exception 'listing not found' using errcode = 'P0002'; end if;
    perform set_config('cc.order_tx','on', true);
    sold_id := public.mark_item_sold(o.seller_id, collection_item_id, o.item_cents / 100.0, 'comixcatalog_order', o.buyer_id, o.id);
    update public.orders set status = p_to, paid_at = now(), sold_item_id = sold_id,
      stripe_payment_intent_id = nullif(p_payload->>'stripe_payment_intent_id',''),
      stripe_charge_id = nullif(p_payload->>'stripe_charge_id',''), ship_to = p_payload->'ship_to'
      where id = o.id returning * into o;
  elsif p_to = 'shipped' then
    tracking := btrim(coalesce(p_payload->>'tracking_number',''));
    if o.total_cents >= (cfg->>'tracking_required_cents')::int and (char_length(tracking) not between 8 and 40 or tracking !~ '^[A-Za-z0-9 -]+$' or p_payload->>'tracking_carrier' not in ('usps','ups','fedex','dhl','other')) then
      raise exception 'valid tracking is required' using errcode = '22023';
    end if;
    update public.orders set status = p_to, shipped_at = now(), tracking_number = nullif(tracking,''),
      tracking_carrier = nullif(p_payload->>'tracking_carrier','') where id = o.id returning * into o;
  elsif p_to = 'delivered' then
    if p_actor_role = 'system' and now() < o.shipped_at + make_interval(days => (cfg->>'auto_deliver_days')::int) then raise exception 'auto delivery is not due' using errcode = '22023'; end if;
    perform set_config('cc.order_tx','on', true);
    if o.sold_item_id is not null then perform public.confirm_sale_transfer(o.sold_item_id, o.buyer_id); end if;
    update public.orders set status = p_to, delivered_at = now(), delivered_by = p_actor_role where id = o.id returning * into o;
  elsif p_to = 'completed' then
    if o.status = 'delivered' and now() < o.delivered_at + make_interval(days => (cfg->>'complete_after_delivery_days')::int) then raise exception 'completion is not due' using errcode = '22023'; end if;
    update public.orders set status = p_to, completed_at = now(), payout_eligible_at = now() where id = o.id returning * into o;
  elsif p_to = 'disputed' then
    if p_actor_role = 'buyer' and (char_length(btrim(coalesce(p_payload->>'reason',''))) not between 1 and 2000) then raise exception 'dispute reason required' using errcode = '22023'; end if;
    update public.orders set status = p_to where id = o.id returning * into o;
  elsif p_to = 'refunded' then
    if o.status = 'cancelled' then
      amount := o.total_cents;
    else
      begin amount := (p_payload->>'amount_cents')::int; exception when others then amount := null; end;
      if amount is null or amount <= 0 then raise exception 'refund amount must be positive' using errcode = '22023'; end if;
    end if;
    if p_actor_role = 'seller' and amount <> o.total_cents then raise exception 'seller refund must be full' using errcode = '22023'; end if;
    if o.refunded_cents + amount > o.total_cents then raise exception 'refund exceeds order total' using errcode = '22023'; end if;
    update public.orders set refunded_cents = refunded_cents + amount,
      status = case when refunded_cents + amount = total_cents then 'refunded' when status = 'disputed' and p_actor_role = 'admin' then 'completed' else status end,
      refunded_at = case when refunded_cents + amount = total_cents then now() else refunded_at end,
      completed_at = case when refunded_cents + amount < total_cents and status = 'disputed' and p_actor_role = 'admin' then now() else completed_at end
      where id = o.id returning * into o;
    -- Fully refunded before delivery: the copy must never reach the buyer's library.
    if o.status = 'refunded' and o.delivered_at is null and o.sold_item_id is not null then
      perform set_config('cc.order_tx','on', true);
      if (before_row->>'status') = 'paid' then
        perform public.mkt_restore_seller_copy(o.sold_item_id);
      else
        update public.sold_items set status = 'refunded' where id = o.sold_item_id and status = 'order_pending';
      end if;
    end if;
  end if;
  insert into public.marketplace_audit_log (actor_id, actor_role, entity, entity_id, action, before, after, request_id, stripe_event_id)
    values (p_actor_id, p_actor_role, 'order', o.id, 'transition:' || (before_row->>'status') || '->' || p_to,
      before_row, to_jsonb(o) - 'ship_to', p_request_id, p_stripe_event_id);
  return o;
end;
$$;

create or replace function public.order_create(p_buyer uuid, p_listing uuid, p_request_id text)
returns public.orders language plpgsql security definer set search_path = public as $$
declare
  l public.listings%rowtype;
  uc public.user_collections%rowtype;
  result public.orders%rowtype;
  cfg jsonb := public.mkt_fee_config();
  expiry timestamptz;
  item int4; shipping int4; total int4; platform_fee int4; processing_fee int4; seller_net int4;
  photos jsonb;
  expired_order uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'service role required' using errcode = '42501'; end if;
  if p_buyer is null or p_listing is null then raise exception 'buyer and listing are required' using errcode = '22023'; end if;
  select * into l from public.listings where id = p_listing for update;
  if not found then raise exception 'listing not found' using errcode = 'P0002'; end if;
  if l.status = 'reserved' then
    select id into expired_order from public.orders where listing_id = l.id and status in ('created','awaiting_payment') and checkout_expires_at < now() order by created_at limit 1;
    if expired_order is not null then
      perform public.order_transition(expired_order, 'cancelled', null, 'system', '{}'::jsonb, p_request_id, null);
      select * into l from public.listings where id = p_listing for update;
    end if;
  end if;
  if l.status <> 'active' then raise exception 'listing is unavailable' using errcode = '55006'; end if;
  if l.price_cents is null then raise exception 'listing is not priced' using errcode = '22023'; end if;
  if not exists (select 1 from public.profiles p where p.id = l.seller_id and p.username is not null and p.is_public is not false and p.show_for_sale is not false) then raise exception 'seller profile is not visible' using errcode = '55006'; end if;
  if p_buyer = l.seller_id then raise exception 'buyer cannot be seller' using errcode = '22023'; end if;
  if exists (select 1 from public.user_blocks where (blocker_id = p_buyer and blocked_id = l.seller_id) or (blocker_id = l.seller_id and blocked_id = p_buyer)) then raise exception 'buyer and seller cannot trade' using errcode = '42501'; end if;
  if not exists (select 1 from auth.users where id = p_buyer and email_confirmed_at is not null) then raise exception 'verified buyer required' using errcode = '42501'; end if;
  -- mark_item_sold needs the buyer profile at payment time; check now, not after the card is charged.
  if not exists (select 1 from public.profiles where id = p_buyer) then raise exception 'buyer profile required' using errcode = '42501'; end if;
  if not public.mkt_seller_can_sell(l.seller_id) then raise exception 'seller is not eligible' using errcode = '55006'; end if;
  select * into uc from public.user_collections where id = l.collection_id;
  if not found then raise exception 'collection item not found' using errcode = 'P0002'; end if;
  item := l.price_cents; shipping := coalesce(l.shipping_cents, 0); total := item + shipping;
  platform_fee := round(total * (cfg->>'platform_fee_bps')::numeric / 10000)::int;
  processing_fee := round(total * (cfg->>'processing_fee_bps')::numeric / 10000)::int + (cfg->>'processing_fee_fixed_cents')::int;
  seller_net := total - platform_fee - processing_fee;
  if seller_net < 0 then raise exception 'seller net cannot be negative' using errcode = '22023'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('storage_path',storage_path,'thumb_path',thumb_path,'kind',kind,'sort_order',sort_order,'width',width,'height',height,'bytes',bytes) order by sort_order,created_at),'[]'::jsonb)
    into photos from public.listing_photos where collection_id = l.collection_id and owner_id = l.seller_id;
  expiry := now() + make_interval(mins => (cfg->>'reservation_minutes')::int);
  update public.listings set status = 'reserved', reserved_until = expiry, updated_at = now() where id = l.id;
  insert into public.orders (
    listing_id,buyer_id,seller_id,series_title,issue_number,release_year,publisher,variant_label,printing_name,gcd_issue_id,cover_path,
    condition,grade_numeric,slab_company,slab_cert_number,restored,signed,condition_notes,photo_keys,
    item_cents,shipping_cents,tax_cents,total_cents,platform_fee_cents,processing_fee_cents,seller_net_cents,checkout_expires_at
  ) values (
    l.id,p_buyer,l.seller_id,l.series_title,l.issue_number,l.release_year,l.publisher,uc.variant_label,null,l.gcd_issue_id,l.cover_path,
    l.condition,l.grade_numeric,l.slab_company,l.slab_cert_number,l.restored,l.signed,l.condition_notes,photos,
    item,shipping,0,total,platform_fee,processing_fee,seller_net,expiry
  ) returning * into result;
  insert into public.marketplace_audit_log (actor_id,actor_role,entity,entity_id,action,before,after,request_id)
    values (p_buyer,'buyer','order',result.id,'created',null,to_jsonb(result)-'ship_to',p_request_id);
  return result;
end;
$$;

alter table public.reports drop constraint if exists reports_target_type_check;
alter table public.reports add constraint reports_target_type_check
  check (target_type in ('listing','message','user','photo','sale','order','feedback'));

revoke all on function public.mark_item_sold(uuid,uuid,numeric,text,uuid,uuid) from public, anon, authenticated;
grant execute on function public.mark_item_sold(uuid,uuid,numeric,text,uuid,uuid) to service_role;
revoke all on function public.mkt_fee_config() from public, anon, authenticated;
revoke all on function public.mkt_seller_can_sell(uuid) from public, anon, authenticated;
revoke all on function public.order_create(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.order_transition(uuid,text,uuid,text,jsonb,text,text) from public, anon, authenticated;
revoke all on function public.order_ship_to(uuid) from public, anon, authenticated;
revoke all on function public.confirm_sale_transfer(uuid, uuid) from public, anon, authenticated;
grant execute on function public.confirm_sale_transfer(uuid, uuid) to service_role;
revoke all on function public.mkt_restore_seller_copy(uuid) from public, anon, authenticated;
revoke all on function public.mkt_guard_collection_open_order() from public, anon, authenticated;
grant execute on function public.mkt_fee_config() to service_role;
grant execute on function public.mkt_seller_can_sell(uuid) to service_role;
grant execute on function public.order_create(uuid,uuid,text) to service_role;
grant execute on function public.order_transition(uuid,text,uuid,text,jsonb,text,text) to service_role;
grant execute on function public.order_ship_to(uuid) to authenticated;

commit;

-- Failure-mode checks (run in the SQL editor with disposable IDs inside begin/rollback):
--   select public.order_create('<buyer>', '<listing>', 'check-1'); -- creates one reservation
--   select public.order_create('<other-buyer>', '<listing>', 'check-2'); -- 55006; one order remains
--   select public.order_transition('<order>', 'paid', null, 'stripe',
--     '{"stripe_checkout_session_id":"wrong","amount_total":1,"currency":"usd","livemode":false}'); -- 22023; unchanged
--   update public.marketplace_audit_log set action = 'changed' where id = 1; -- 55000
--   delete from public.marketplace_audit_log where id = 1; -- 55000
--   truncate public.marketplace_audit_log; -- 55000
