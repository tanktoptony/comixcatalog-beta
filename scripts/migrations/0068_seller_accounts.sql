begin;

create table if not exists public.seller_accounts (
  user_id uuid primary key references auth.users(id) on delete restrict,
  stripe_account_id text unique,
  livemode boolean not null default false,
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  details_submitted boolean not null default false,
  requirements_due jsonb not null default '[]'::jsonb,
  tier text not null default 'new' check (tier in ('new','established','limited','suspended')),
  payouts_frozen boolean not null default false,
  completed_orders integer not null default 0 check (completed_orders >= 0),
  bank_changed_at timestamptz,
  promoted_by uuid,
  tier_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.seller_accounts enable row level security;
drop policy if exists seller_accounts_owner_select on public.seller_accounts;
create policy seller_accounts_owner_select on public.seller_accounts for select to authenticated using (auth.uid() = user_id);
revoke insert, update, delete on public.seller_accounts from anon, authenticated;
grant select on public.seller_accounts to authenticated;

create or replace function public.mkt_checkout_livemode() returns boolean
language sql immutable as $$ select false $$;
comment on function public.mkt_checkout_livemode() is 'Marketplace checkout mode. Flip to true in the live-keys migration.';

create or replace function public.mkt_seller_config() returns jsonb
language sql immutable as $$ select '{"photos_required_cents":10000,"new_seller_max_price_cents":100000,"new_seller_max_listings":25,"new_seller_max_open_cents":200000,"promote_after_completed_orders":5}'::jsonb $$;

create or replace function public.mkt_upsert_seller_account(p_user uuid, p_stripe_account_id text, p_livemode boolean, p_charges boolean, p_payouts boolean, p_details boolean, p_requirements jsonb)
returns public.seller_accounts language plpgsql security definer set search_path = public as $$
declare old_row public.seller_accounts%rowtype; result public.seller_accounts%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'service role required' using errcode='42501'; end if;
  select * into old_row from public.seller_accounts where user_id=p_user for update;
  if found and old_row.stripe_account_id is not null and old_row.stripe_account_id is distinct from p_stripe_account_id then
    raise exception 'stripe account cannot be changed' using errcode='55000';
  end if;
  insert into public.seller_accounts(user_id,stripe_account_id,livemode,charges_enabled,payouts_enabled,details_submitted,requirements_due)
  values(p_user,p_stripe_account_id,p_livemode,p_charges,p_payouts,p_details,coalesce(p_requirements,'[]'::jsonb))
  on conflict(user_id) do update set stripe_account_id=coalesce(seller_accounts.stripe_account_id,excluded.stripe_account_id), livemode=excluded.livemode,
    charges_enabled=excluded.charges_enabled,payouts_enabled=excluded.payouts_enabled,details_submitted=excluded.details_submitted,
    requirements_due=excluded.requirements_due,updated_at=now() returning * into result;
  if not found or old_row.user_id is null or (to_jsonb(old_row) - 'updated_at' - 'created_at') is distinct from (to_jsonb(result) - 'updated_at' - 'created_at') then
    insert into public.marketplace_audit_log(actor_role,entity,entity_id,action,before,after)
      values('system','seller',p_user,'seller_account_updated',case when old_row.user_id is null then null else to_jsonb(old_row) end,to_jsonb(result));
  end if;
  return result;
end $$;

create or replace function public.seller_set_tier(p_admin uuid,p_user uuid,p_tier text,p_reason text)
returns public.seller_accounts language plpgsql security definer set search_path=public as $$
declare old_row public.seller_accounts%rowtype; result public.seller_accounts%rowtype;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'service role required' using errcode='42501'; end if;
  if p_tier not in ('new','established','limited','suspended') then raise exception 'invalid tier' using errcode='22023'; end if;
  if char_length(btrim(coalesce(p_reason,''))) not between 3 and 500 then raise exception 'reason must be 3 to 500 characters' using errcode='22023'; end if;
  select * into old_row from public.seller_accounts where user_id=p_user for update;
  if not found then raise exception 'seller account not found' using errcode='P0002'; end if;
  update public.seller_accounts set tier=p_tier,tier_reason=btrim(p_reason),promoted_by=p_admin,updated_at=now() where user_id=p_user returning * into result;
  insert into public.marketplace_audit_log(actor_id,actor_role,entity,entity_id,action,before,after) values(p_admin,'admin','seller',p_user,'tier_set',to_jsonb(old_row),to_jsonb(result));
  return result;
end $$;

create or replace function public.seller_freeze_payouts(p_admin uuid,p_user uuid,p_frozen boolean,p_reason text)
returns public.seller_accounts language plpgsql security definer set search_path=public as $$
declare old_row public.seller_accounts%rowtype; result public.seller_accounts%rowtype;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'service role required' using errcode='42501'; end if;
  if char_length(btrim(coalesce(p_reason,''))) not between 3 and 500 then raise exception 'reason must be 3 to 500 characters' using errcode='22023'; end if;
  select * into old_row from public.seller_accounts where user_id=p_user for update;
  if not found then raise exception 'seller account not found' using errcode='P0002'; end if;
  update public.seller_accounts set payouts_frozen=p_frozen,updated_at=now() where user_id=p_user returning * into result;
  insert into public.marketplace_audit_log(actor_id,actor_role,entity,entity_id,action,before,after) values(p_admin,'admin','seller',p_user,case when p_frozen then 'payouts_frozen' else 'payouts_unfrozen' end,to_jsonb(old_row),to_jsonb(result));
  return result;
end $$;

create or replace function public.mkt_seller_can_sell(p_seller uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.seller_accounts where user_id=p_seller and charges_enabled and details_submitted and tier in ('new','established') and livemode=public.mkt_checkout_livemode())
$$;

create or replace function public.mkt_listing_checkout_block(p_listing uuid) returns text
language plpgsql stable security definer set search_path=public as $$
declare l public.listings%rowtype; s public.seller_accounts%rowtype; cfg jsonb:=public.mkt_seller_config(); active_count int; open_cents bigint;
begin
  select * into l from public.listings where id=p_listing;
  if not found or l.status <> 'active' then return 'not_active'; end if;
  if l.price_cents is null then return 'not_priced'; end if;
  select * into s from public.seller_accounts where user_id=l.seller_id;
  if not found or not s.charges_enabled or not s.details_submitted or s.livemode <> public.mkt_checkout_livemode() then return 'seller_not_onboarded'; end if;
  if s.tier in ('limited','suspended') then return 'seller_restricted'; end if;
  if nullif(btrim(coalesce(l.slab_company,'')),'') is not null and nullif(btrim(coalesce(l.slab_cert_number,'')),'') is null then return 'slab_needs_cert'; end if;
  if l.price_cents >= (cfg->>'photos_required_cents')::int and not (
    exists(select 1 from public.listing_photos where collection_id=l.collection_id and kind='front') and
    exists(select 1 from public.listing_photos where collection_id=l.collection_id and kind='back')) then return 'needs_photos'; end if;
  if s.tier='new' and l.price_cents > (cfg->>'new_seller_max_price_cents')::int then return 'new_seller_price_cap'; end if;
  if s.tier='new' then
    select count(*) into active_count from public.listings where seller_id=l.seller_id and status='active' and price_cents is not null;
    if active_count > (cfg->>'new_seller_max_listings')::int then return 'new_seller_listing_cap'; end if;
    select coalesce(sum(total_cents),0) into open_cents from public.orders where seller_id=l.seller_id and status in ('created','awaiting_payment','paid');
    if open_cents + l.price_cents + coalesce(l.shipping_cents,0) > (cfg->>'new_seller_max_open_cents')::int then return 'new_seller_open_order_cap'; end if;
  end if;
  return null;
end $$;

create or replace function public.mkt_promote_seller_after_completion() returns trigger
language plpgsql security definer set search_path=public as $$
declare seller public.seller_accounts%rowtype; cfg jsonb:=public.mkt_seller_config(); old_seller jsonb;
begin
  if new.status='completed' and old.status is distinct from 'completed' then
    update public.seller_accounts set completed_orders=completed_orders+1,updated_at=now() where user_id=new.seller_id returning * into seller;
    old_seller:=to_jsonb(seller);
    if seller.tier='new' and seller.completed_orders >= (cfg->>'promote_after_completed_orders')::int
      and not exists(select 1 from public.orders o where o.seller_id=new.seller_id and o.status='disputed')
      and not exists(select 1 from public.marketplace_audit_log a join public.orders o on o.id=a.entity_id where a.entity='order' and a.action='transition:disputed->refunded' and o.seller_id=new.seller_id) then
      update public.seller_accounts set tier='established',tier_reason='auto: completed orders',updated_at=now() where user_id=new.seller_id returning * into seller;
      insert into public.marketplace_audit_log(actor_role,entity,entity_id,action,before,after) values('system','seller',new.seller_id,'tier_promoted',old_seller,to_jsonb(seller));
    end if;
  end if;
  return new;
end $$;
drop trigger if exists orders_promote_seller on public.orders;
create trigger orders_promote_seller after update of status on public.orders for each row execute function public.mkt_promote_seller_after_completion();

create or replace function public.order_create(p_buyer uuid, p_listing uuid, p_request_id text)
returns public.orders language plpgsql security definer set search_path = public as $$
declare l public.listings%rowtype; uc public.user_collections%rowtype; result public.orders%rowtype; cfg jsonb:=public.mkt_fee_config(); expiry timestamptz;
  item int4; shipping int4; total int4; platform_fee int4; processing_fee int4; seller_net int4; photos jsonb; expired_order uuid; block_code text;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'service role required' using errcode='42501'; end if;
  if p_buyer is null or p_listing is null then raise exception 'buyer and listing are required' using errcode='22023'; end if;
  select * into l from public.listings where id=p_listing for update;
  if not found then raise exception 'listing not found' using errcode='P0002'; end if;
  if l.status='reserved' then select id into expired_order from public.orders where listing_id=l.id and status in ('created','awaiting_payment') and checkout_expires_at<now() order by created_at limit 1;
    if expired_order is not null then perform public.order_transition(expired_order,'cancelled',null,'system','{}'::jsonb,p_request_id,null); select * into l from public.listings where id=p_listing for update; end if;
  end if;
  if l.status<>'active' then raise exception 'listing is unavailable' using errcode='55006'; end if;
  if l.price_cents is null then raise exception 'listing is not priced' using errcode='22023'; end if;
  if not exists(select 1 from public.profiles p where p.id=l.seller_id and p.username is not null and p.is_public is not false and p.show_for_sale is not false) then raise exception 'seller profile is not visible' using errcode='55006'; end if;
  if p_buyer=l.seller_id then raise exception 'buyer cannot be seller' using errcode='22023'; end if;
  if exists(select 1 from public.user_blocks where (blocker_id=p_buyer and blocked_id=l.seller_id) or (blocker_id=l.seller_id and blocked_id=p_buyer)) then raise exception 'buyer and seller cannot trade' using errcode='42501'; end if;
  if not exists(select 1 from auth.users where id=p_buyer and email_confirmed_at is not null) then raise exception 'verified buyer required' using errcode='42501'; end if;
  if not exists(select 1 from public.profiles where id=p_buyer) then raise exception 'buyer profile required' using errcode='42501'; end if;
  block_code:=public.mkt_listing_checkout_block(l.id); if block_code is not null then raise exception 'listing not eligible: %',block_code using errcode='55006'; end if;
  select * into uc from public.user_collections where id=l.collection_id; if not found then raise exception 'collection item not found' using errcode='P0002'; end if;
  item:=l.price_cents; shipping:=coalesce(l.shipping_cents,0); total:=item+shipping;
  platform_fee:=round(total*(cfg->>'platform_fee_bps')::numeric/10000)::int; processing_fee:=round(total*(cfg->>'processing_fee_bps')::numeric/10000)::int+(cfg->>'processing_fee_fixed_cents')::int; seller_net:=total-platform_fee-processing_fee;
  if seller_net<0 then raise exception 'seller net cannot be negative' using errcode='22023'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('storage_path',storage_path,'thumb_path',thumb_path,'kind',kind,'sort_order',sort_order,'width',width,'height',height,'bytes',bytes) order by sort_order,created_at),'[]'::jsonb) into photos from public.listing_photos where collection_id=l.collection_id and owner_id=l.seller_id;
  expiry:=now()+make_interval(mins=>(cfg->>'reservation_minutes')::int); update public.listings set status='reserved',reserved_until=expiry,updated_at=now() where id=l.id;
  insert into public.orders(listing_id,buyer_id,seller_id,series_title,issue_number,release_year,publisher,variant_label,printing_name,gcd_issue_id,cover_path,condition,grade_numeric,slab_company,slab_cert_number,restored,signed,condition_notes,photo_keys,item_cents,shipping_cents,tax_cents,total_cents,platform_fee_cents,processing_fee_cents,seller_net_cents,checkout_expires_at,livemode)
  values(l.id,p_buyer,l.seller_id,l.series_title,l.issue_number,l.release_year,l.publisher,uc.variant_label,null,l.gcd_issue_id,l.cover_path,l.condition,l.grade_numeric,l.slab_company,l.slab_cert_number,l.restored,l.signed,l.condition_notes,photos,item,shipping,0,total,platform_fee,processing_fee,seller_net,expiry,public.mkt_checkout_livemode()) returning * into result;
  insert into public.marketplace_audit_log(actor_id,actor_role,entity,entity_id,action,before,after,request_id) values(p_buyer,'buyer','order',result.id,'created',null,to_jsonb(result)-'ship_to',p_request_id); return result;
end $$;

revoke all on function public.mkt_checkout_livemode() from public,anon,authenticated;
revoke all on function public.mkt_seller_config() from public,anon,authenticated;
revoke all on function public.mkt_upsert_seller_account(uuid,text,boolean,boolean,boolean,boolean,jsonb) from public,anon,authenticated;
revoke all on function public.seller_set_tier(uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.seller_freeze_payouts(uuid,uuid,boolean,text) from public,anon,authenticated;
revoke all on function public.mkt_listing_checkout_block(uuid) from public,anon,authenticated;
revoke all on function public.mkt_promote_seller_after_completion() from public,anon,authenticated;
grant execute on function public.mkt_checkout_livemode(),public.mkt_seller_config(),public.mkt_upsert_seller_account(uuid,text,boolean,boolean,boolean,boolean,jsonb),public.seller_set_tier(uuid,uuid,text,text),public.seller_freeze_payouts(uuid,uuid,boolean,text),public.mkt_listing_checkout_block(uuid) to service_role;

commit;

-- Failure-mode checks: as authenticated, INSERT/UPDATE/DELETE seller_accounts must raise 42501 and SELECT returns only auth.uid().
-- Calling mkt_upsert_seller_account with a different Stripe account must raise 55000 and leave the original row unchanged.
-- order_create for an ineligible listing must raise 55006 with "listing not eligible: <stable_code>" and create no order.
