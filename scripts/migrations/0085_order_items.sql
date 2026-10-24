begin;

alter table public.seller_accounts
  add column if not exists additional_item_shipping_cents int4 not null default 100;
alter table public.seller_accounts drop constraint if exists seller_accounts_additional_shipping_check;
alter table public.seller_accounts add constraint seller_accounts_additional_shipping_check
  check (additional_item_shipping_cents between 0 and 2000);

create table public.order_items (
  order_id uuid not null references public.orders(id) on delete cascade,
  listing_id uuid not null,
  collection_id uuid,
  sold_item_id uuid references public.sold_items(id) on delete set null,
  gcd_issue_id bigint,
  series_title text not null,
  issue_number text,
  cover_path text,
  condition text,
  grade_numeric numeric,
  slab_company text,
  item_cents int4 not null check (item_cents > 0),
  created_at timestamptz not null default now(),
  primary key (order_id, listing_id)
);

alter table public.order_items enable row level security;
create policy order_items_parties_read on public.order_items for select
  using (exists (select 1 from public.orders o where o.id=order_id and auth.uid() in (o.buyer_id,o.seller_id)));
revoke all on public.order_items from public, anon, authenticated;
grant select on public.order_items to authenticated;
grant all on public.order_items to service_role;

-- Backfill one item per existing order. A sold copy's listing is deleted with
-- its collection row, which clears orders.listing_id, so paid and later
-- orders take the listing and copy from their sold_items row (applied this
-- way in production 2026-10-24; the first version found no rows).
insert into public.order_items(order_id,listing_id,collection_id,sold_item_id,gcd_issue_id,series_title,issue_number,cover_path,condition,grade_numeric,slab_company,item_cents,created_at)
select o.id,coalesce(o.listing_id,si.listing_id),coalesce(l.collection_id,si.collection_item_id),o.sold_item_id,o.gcd_issue_id,o.series_title,o.issue_number,o.cover_path,o.condition,o.grade_numeric,o.slab_company,o.item_cents,o.created_at
from public.orders o
left join public.listings l on l.id=o.listing_id
left join public.sold_items si on si.id=o.sold_item_id
where coalesce(o.listing_id,si.listing_id) is not null
on conflict do nothing;

create index order_items_listing_idx on public.order_items(listing_id);

create or replace function public.order_create_multi(p_buyer uuid,p_listings uuid[],p_request_id text)
returns public.orders language plpgsql security definer set search_path=public as $$
declare
  ids uuid[]; n int; seller uuid; extra int; item_total int; shipping int; total int;
  platform_fee int; processing_fee int; seller_net int; expiry timestamptz;
  cfg jsonb:=public.mkt_fee_config(); block_code text; first_l public.listings%rowtype;
  result public.orders%rowtype; r record; photos jsonb;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'service role required' using errcode='42501'; end if;
  select array_agg(distinct x order by x) into ids from unnest(p_listings) x;
  n:=coalesce(array_length(ids,1),0);
  if p_buyer is null or n not between 1 and 20 or n<>coalesce(array_length(p_listings,1),0) then
    raise exception '1 to 20 unique listings are required' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('mkt_buyer:'||p_buyer::text));
  -- Deterministic row locks make overlapping carts serialize without deadlocks.
  perform 1 from public.listings where id=any(ids) order by id for update;
  if (select count(*) from public.listings where id=any(ids))<>n then raise exception 'listing not found' using errcode='P0002'; end if;

  -- Lazily release expired reservations before validating the whole cart.
  for r in select distinct oi.order_id from public.order_items oi join public.orders o on o.id=oi.order_id
    where oi.listing_id=any(ids) and o.status in ('created','awaiting_payment') and o.checkout_expires_at<now()
  loop perform public.order_transition(r.order_id,'cancelled',null,'system','{}',p_request_id,null); end loop;

  if exists(select 1 from public.listings where id=any(ids) and (status<>'active' or price_cents is null)) then
    raise exception 'listing is unavailable' using errcode='55006';
  end if;
  select seller_id into seller from public.listings where id=ids[1];
  if exists(select 1 from public.listings where id=any(ids) and seller_id<>seller) then raise exception 'listings must have one seller' using errcode='22023'; end if;
  if seller=p_buyer then raise exception 'buyer cannot be seller' using errcode='22023'; end if;
  if not exists(select 1 from public.profiles p where p.id=seller and p.username is not null and p.is_public is not false and p.show_for_sale is not false)
    then raise exception 'seller profile is not visible' using errcode='55006'; end if;
  if not exists(select 1 from public.profiles where id=p_buyer) then raise exception 'buyer profile required' using errcode='42501'; end if;
  if exists(select 1 from public.user_blocks where (blocker_id=p_buyer and blocked_id=seller) or (blocker_id=seller and blocked_id=p_buyer))
    then raise exception 'buyer and seller cannot trade' using errcode='42501'; end if;
  for r in select id from public.listings where id=any(ids) loop
    block_code:=public.mkt_listing_checkout_block(r.id);
    if block_code is not null then raise exception 'listing not eligible: %',block_code using errcode='55006'; end if;
  end loop;
  -- Every copy must still exist: the paid step marks each one sold, and a
  -- missing copy there would strand an order the buyer already paid for.
  if exists(select 1 from public.listings l where l.id=any(ids)
    and not exists(select 1 from public.user_collections uc where uc.id=l.collection_id)) then
    raise exception 'collection item not found' using errcode='P0002';
  end if;
  select coalesce(additional_item_shipping_cents,100) into extra from public.seller_accounts where user_id=seller;
  extra:=coalesce(extra,100);
  select sum(price_cents),max(coalesce(shipping_cents,0)) into item_total,shipping from public.listings where id=any(ids);
  shipping:=shipping+extra*(n-1); total:=item_total+shipping;
  -- mkt_listing_checkout_block checks a new seller's open-order cap one copy
  -- at a time; check the whole order against it too.
  if exists(select 1 from public.seller_accounts where user_id=seller and tier='new')
    and (select coalesce(sum(total_cents),0) from public.orders where seller_id=seller and status in ('created','awaiting_payment','paid'))
      + total > (public.mkt_seller_config()->>'new_seller_max_open_cents')::int then
    raise exception 'listing not eligible: new_seller_open_order_cap' using errcode='55006';
  end if;
  block_code:=public.mkt_buyer_order_block(p_buyer,total);
  if block_code is not null then raise exception 'buyer limit: %',block_code using errcode='54000'; end if;
  platform_fee:=round(total*(cfg->>'platform_fee_bps')::numeric/10000)::int;
  processing_fee:=round(total*(cfg->>'processing_fee_bps')::numeric/10000)::int+(cfg->>'processing_fee_fixed_cents')::int;
  seller_net:=total-platform_fee-processing_fee;
  if seller_net<0 then raise exception 'seller net cannot be negative' using errcode='22023'; end if;
  expiry:=now()+make_interval(mins=>(cfg->>'reservation_minutes')::int);
  select * into first_l from public.listings where id=ids[1];
  select coalesce(jsonb_agg(jsonb_build_object('storage_path',storage_path,'thumb_path',thumb_path,'kind',kind,'sort_order',sort_order,'width',width,'height',height,'bytes',bytes) order by sort_order,created_at),'[]')
    into photos from public.listing_photos where collection_id=first_l.collection_id and owner_id=seller;
  update public.listings set status='reserved',reserved_until=expiry,updated_at=now() where id=any(ids);
  insert into public.orders(listing_id,buyer_id,seller_id,series_title,issue_number,release_year,publisher,variant_label,gcd_issue_id,cover_path,condition,grade_numeric,slab_company,slab_cert_number,restored,signed,condition_notes,photo_keys,item_cents,shipping_cents,tax_cents,total_cents,platform_fee_cents,processing_fee_cents,seller_net_cents,checkout_expires_at,livemode)
  select first_l.id,p_buyer,seller,first_l.series_title,first_l.issue_number,first_l.release_year,first_l.publisher,uc.variant_label,first_l.gcd_issue_id,first_l.cover_path,first_l.condition,first_l.grade_numeric,first_l.slab_company,first_l.slab_cert_number,first_l.restored,first_l.signed,first_l.condition_notes,photos,item_total,shipping,0,total,platform_fee,processing_fee,seller_net,expiry,public.mkt_checkout_livemode()
  from public.user_collections uc where uc.id=first_l.collection_id returning * into result;
  insert into public.order_items(order_id,listing_id,collection_id,gcd_issue_id,series_title,issue_number,cover_path,condition,grade_numeric,slab_company,item_cents)
  select result.id,l.id,l.collection_id,l.gcd_issue_id,l.series_title,l.issue_number,l.cover_path,l.condition,l.grade_numeric,l.slab_company,l.price_cents
  from public.listings l where l.id=any(ids);
  insert into public.marketplace_audit_log(actor_id,actor_role,entity,entity_id,action,after,request_id)
    values(p_buyer,'buyer','order',result.id,'created',to_jsonb(result)-'ship_to',p_request_id);
  return result;
end $$;

create or replace function public.order_create(p_buyer uuid,p_listing uuid,p_request_id text)
returns public.orders language sql security definer set search_path=public as $$
  select public.order_create_multi(p_buyer,array[p_listing],p_request_id)
$$;

-- Multi-item lifecycle side effects. The first item is mirrored back onto orders for compatibility.
create or replace function public.mkt_order_items_paid(p_order uuid,p_seller uuid,p_buyer uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare i record; sid uuid; first_sid uuid;
begin
  if current_setting('cc.order_tx',true)<>'on' then raise exception 'order transition required' using errcode='42501'; end if;
  for i in select * from public.order_items where order_id=p_order order by created_at,listing_id loop
    sid:=public.mark_item_sold(p_seller,i.collection_id,i.item_cents/100.0,'comixcatalog_order',p_buyer,p_order);
    update public.order_items set sold_item_id=sid where order_id=p_order and listing_id=i.listing_id;
    first_sid:=coalesce(first_sid,sid);
  end loop;
  return first_sid;
end $$;

create or replace function public.mkt_order_items_deliver(p_order uuid,p_buyer uuid) returns void
language plpgsql security definer set search_path=public as $$ declare i record; begin
  if current_setting('cc.order_tx',true)<>'on' then raise exception 'order transition required' using errcode='42501'; end if;
  for i in select sold_item_id from public.order_items where order_id=p_order and sold_item_id is not null loop
    perform public.confirm_sale_transfer(i.sold_item_id,p_buyer);
  end loop;
end $$;

create or replace function public.mkt_order_items_refund(p_order uuid,p_restore boolean) returns void
language plpgsql security definer set search_path=public as $$ declare i record; begin
  if current_setting('cc.order_tx',true)<>'on' then raise exception 'order transition required' using errcode='42501'; end if;
  for i in select sold_item_id from public.order_items where order_id=p_order and sold_item_id is not null loop
    if p_restore then perform public.mkt_restore_seller_copy(i.sold_item_id);
    else update public.sold_items set status='refunded' where id=i.sold_item_id and status='order_pending'; end if;
  end loop;
end $$;

-- Patch the existing transition function's item-specific statements through a source rewrite.
do $$ declare body text; begin
  select prosrc into body from pg_proc where oid='public.order_transition(uuid,text,uuid,text,jsonb,text,text)'::regprocedure;
  body:=replace(body,$old$update public.listings set status = 'active', reserved_until = null, updated_at = now() where id = o.listing_id and status = 'reserved';$old$,
    $new$update public.listings set status='active',reserved_until=null,updated_at=now() where id in (select listing_id from public.order_items where order_id=o.id) and status='reserved';$new$);
  body:=replace(body,$old$select collection_id into collection_item_id from public.listings where id = o.listing_id;
    if collection_item_id is null then raise exception 'listing not found' using errcode = 'P0002'; end if;
    perform set_config('cc.order_tx','on', true);
    sold_id := public.mark_item_sold(o.seller_id, collection_item_id, o.item_cents / 100.0, 'comixcatalog_order', o.buyer_id, o.id);$old$,
    $new$perform set_config('cc.order_tx','on',true);
    sold_id:=public.mkt_order_items_paid(o.id,o.seller_id,o.buyer_id);$new$);
  body:=replace(body,$old$sold_id := public.mark_item_sold(o.seller_id, collection_item_id, o.item_cents / 100.0, 'comixcatalog_order', o.buyer_id, o.id);$old$,
    $new$sold_id:=public.mkt_order_items_paid(o.id,o.seller_id,o.buyer_id);$new$);
  body:=replace(body,$old$if o.sold_item_id is not null then perform public.confirm_sale_transfer(o.sold_item_id, o.buyer_id); end if;$old$,
    $new$perform public.mkt_order_items_deliver(o.id,o.buyer_id);$new$);
  body:=replace(body,$old$if (before_row->>'status') = 'paid' then
        perform public.mkt_restore_seller_copy(o.sold_item_id);
      else
        update public.sold_items set status = 'refunded' where id = o.sold_item_id and status = 'order_pending';
      end if;$old$,
    $new$perform public.mkt_order_items_refund(o.id,(before_row->>'status')='paid');$new$);
  body:=replace(body,$old$perform public.mkt_restore_seller_copy(o.sold_item_id);$old$,$new$perform public.mkt_order_items_refund(o.id,true);$new$);
  body:=replace(body,$old$update public.sold_items set status = 'refunded' where id = o.sold_item_id and status = 'order_pending';$old$,$new$perform public.mkt_order_items_refund(o.id,false);$new$);
  -- Fail loudly if the rewrite missed anything: a leftover single-item
  -- statement would sell or restore only the first copy of a multi-book order.
  if body like '%o.listing_id and status%' or body like '%mark_item_sold(%'
    or body like '%confirm_sale_transfer(o.sold_item_id%' or body like '%mkt_restore_seller_copy(o.sold_item_id%'
    or body like '%where id = o.sold_item_id and status = ''order_pending''%' then
    raise exception 'order_transition rewrite left a single-item statement';
  end if;
  if body not like '%mkt_order_items_paid(%' or body not like '%mkt_order_items_deliver(%'
    or body not like '%mkt_order_items_refund(%' or body not like '%from public.order_items where order_id=o.id%' then
    raise exception 'order_transition rewrite is missing a multi-item statement';
  end if;
  execute 'create or replace function public.order_transition(p_order uuid,p_to text,p_actor_id uuid,p_actor_role text,p_payload jsonb default ''{}''::jsonb,p_request_id text default null,p_stripe_event_id text default null) returns public.orders language plpgsql security definer set search_path=public as '||quote_literal(body);
end $$;

create or replace function public.mkt_guard_collection_open_order() returns trigger
language plpgsql security definer set search_path=public as $$ begin
  if current_setting('cc.order_tx',true)='on' then if tg_op='DELETE' then return old; else return new; end if; end if;
  if exists(select 1 from public.listings l join public.order_items oi on oi.listing_id=l.id join public.orders o on o.id=oi.order_id
    where l.collection_id=old.id and o.status in ('created','awaiting_payment','paid')) then raise exception 'copy has an open order' using errcode='55006'; end if;
  if tg_op='DELETE' then return old; else return new; end if;
end $$;

revoke all on function public.order_create_multi(uuid,uuid[],text) from public,anon,authenticated;
grant execute on function public.order_create_multi(uuid,uuid[],text) to service_role;
revoke all on function public.mkt_order_items_paid(uuid,uuid,uuid),public.mkt_order_items_deliver(uuid,uuid),public.mkt_order_items_refund(uuid,boolean) from public,anon,authenticated;
grant execute on function public.mkt_order_items_paid(uuid,uuid,uuid),public.mkt_order_items_deliver(uuid,uuid),public.mkt_order_items_refund(uuid,boolean) to service_role;

commit;

-- Rollback:
-- begin; drop function if exists public.order_create_multi(uuid,uuid[],text); drop function if exists public.mkt_order_items_paid(uuid,uuid,uuid);
-- drop function if exists public.mkt_order_items_deliver(uuid,uuid); drop function if exists public.mkt_order_items_refund(uuid,boolean);
-- drop table if exists public.order_items; alter table public.seller_accounts drop column if exists additional_item_shipping_cents; commit;
