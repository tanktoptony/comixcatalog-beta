-- Buy now needs a condition: a raw grade (Near Mint, Fine...) or a slab
-- grade. Before this every priced listing was buyable with "Ungraded" as
-- the only description of the copy, which a stranger has no reason to
-- trust. Same function as 0068 otherwise; the new check sits after the
-- seller checks so an un-onboarded seller still hears about payouts first.
-- (Found 2026-10-26: all 23 priced listings on the site had no condition.)

begin;

create or replace function public.mkt_listing_checkout_block(p_listing uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare l public.listings%rowtype; s public.seller_accounts%rowtype; cfg jsonb:=public.mkt_seller_config(); active_count int; open_cents bigint;
begin
  select * into l from public.listings where id=p_listing;
  if not found or l.status <> 'active' then return 'not_active'; end if;
  if l.price_cents is null then return 'not_priced'; end if;
  select * into s from public.seller_accounts where user_id=l.seller_id;
  if not found or not s.charges_enabled or not s.details_submitted or s.livemode <> public.mkt_checkout_livemode() then return 'seller_not_onboarded'; end if;
  if s.tier in ('limited','suspended') then return 'seller_restricted'; end if;
  if l.grade_numeric is null and nullif(btrim(coalesce(l.condition,'')),'') is null then return 'needs_condition'; end if;
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

revoke all on function public.mkt_listing_checkout_block(uuid) from public,anon,authenticated;

commit;

-- Rollback: re-run mkt_listing_checkout_block from 0068_seller_accounts.sql.
