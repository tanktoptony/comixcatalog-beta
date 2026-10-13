-- 0060_sale_transfers.sql
-- Buyer-confirmed transfers of the exact sold copy.

begin;

create index if not exists sold_items_buyer_status_idx
  on public.sold_items (buyer_id, status, created_at desc)
  where buyer_id is not null;

alter table public.reports drop constraint if exists reports_target_type_check;
alter table public.reports add constraint reports_target_type_check
  check (target_type in ('listing','message','user','photo','sale'));

drop function if exists public.mark_item_sold(uuid, uuid, numeric, text);
create or replace function public.mark_item_sold(
  p_seller_id uuid,
  p_collection_item_id uuid,
  p_sale_price numeric,
  p_sold_via text,
  p_buyer_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  item public.user_collections%rowtype;
  active_listing public.listings%rowtype;
  snap record;
  sold_id uuid;
  photo_keys jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_sale_price is null or p_sale_price <= 0 or p_sale_price > 99999999.99 then
    raise exception 'sale price must be greater than zero' using errcode = '22023';
  end if;
  if p_sold_via not in ('comixcatalog_message', 'offsite') then
    raise exception 'invalid sold via value' using errcode = '22023';
  end if;
  if p_buyer_id = p_seller_id then
    raise exception 'seller cannot be the buyer' using errcode = '22023';
  end if;
  if p_buyer_id is not null and not exists (select 1 from public.profiles where id = p_buyer_id) then
    raise exception 'buyer not found' using errcode = 'P0002';
  end if;
  if p_buyer_id is not null and exists (
    select 1 from public.user_blocks
    where (blocker_id = p_seller_id and blocked_id = p_buyer_id)
       or (blocker_id = p_buyer_id and blocked_id = p_seller_id)
  ) then
    raise exception 'buyer and seller cannot trade' using errcode = '42501';
  end if;

  select * into item from public.user_collections
  where id = p_collection_item_id and user_id = p_seller_id for update;
  if not found then raise exception 'collection item not found' using errcode = 'P0002'; end if;
  if item.status <> 'for_sale' then raise exception 'collection item is not for sale' using errcode = '22023'; end if;

  select * into active_listing from public.listings
  where collection_id = item.id and seller_id = p_seller_id
    and status in ('draft','active','reserved')
  order by created_at desc limit 1 for update;

  if item.gcd_issue_id is not null then
    select * into snap from public.listing_snapshot(item.gcd_issue_id);
  else
    select c.series_title, c.issue_number, c.release_year, c.publisher into snap
    from public.comics c where c.id = item.comic_id;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'storage_path', lp.storage_path, 'thumb_path', lp.thumb_path, 'kind', lp.kind,
    'sort_order', lp.sort_order, 'width', lp.width, 'height', lp.height, 'bytes', lp.bytes
  ) order by lp.sort_order, lp.created_at), '[]'::jsonb) into photo_keys
  from public.listing_photos lp where lp.collection_id = item.id and lp.owner_id = p_seller_id;

  insert into public.sold_items (
    seller_id, buyer_id, collection_item_id, listing_id, gcd_issue_id, comic_id,
    series_title, issue_number, release_year, publisher, variant_label, copy_number,
    condition, grade_numeric, slab_company, slab_cert_number, notes, purchase_price,
    market_value, user_cover_url, seller_photo_keys, listing_snapshot, sale_price,
    sold_via, status
  ) values (
    p_seller_id, p_buyer_id, item.id, active_listing.id, item.gcd_issue_id, item.comic_id,
    coalesce(active_listing.series_title, snap.series_title, 'Untitled'),
    coalesce(active_listing.issue_number, snap.issue_number),
    coalesce(active_listing.release_year, snap.release_year),
    coalesce(active_listing.publisher, snap.publisher), item.variant_label, item.copy_number,
    item.condition, item.grade_numeric, item.slab_company, item.slab_cert_number, item.notes,
    item.purchase_price, item.market_value, item.user_cover_url, photo_keys,
    case when active_listing.id is null then '{}'::jsonb else to_jsonb(active_listing) - 'seller_id' - 'collection_id' end,
    p_sale_price, p_sold_via, case when p_buyer_id is null then 'recorded' else 'pending_buyer' end
  ) returning id into sold_id;

  if active_listing.id is not null then
    update public.listings set status = 'sold', sold_at = now(), updated_at = now()
    where id = active_listing.id;
  end if;
  delete from public.user_collections where id = item.id and user_id = p_seller_id;
  if not found then raise exception 'collection item changed during sale' using errcode = '40001'; end if;
  return sold_id;
end;
$$;

revoke all on function public.mark_item_sold(uuid, uuid, numeric, text, uuid) from public, anon, authenticated;
grant execute on function public.mark_item_sold(uuid, uuid, numeric, text, uuid) to service_role;

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
  if sale.status <> 'pending_buyer' then raise exception 'purchase is not pending' using errcode = '22023'; end if;

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

revoke all on function public.confirm_sale_transfer(uuid, uuid) from public, anon, authenticated;
grant execute on function public.confirm_sale_transfer(uuid, uuid) to service_role;

create or replace function public.dispute_sale_transfer(p_sale_id uuid, p_buyer_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'service role required' using errcode = '42501'; end if;
  update public.sold_items set status = 'disputed'
  where id = p_sale_id and buyer_id = p_buyer_id and status = 'pending_buyer';
  if not found then raise exception 'purchase is not pending' using errcode = '22023'; end if;
  insert into public.reports (reporter_id, target_type, target_id, reason, details)
  values (p_buyer_id, 'sale', p_sale_id, 'other', 'Buyer disputed a seller-recorded purchase.');
end;
$$;
revoke all on function public.dispute_sale_transfer(uuid, uuid) from public, anon, authenticated;
grant execute on function public.dispute_sale_transfer(uuid, uuid) to service_role;

-- Buyers use server routes only. Seller-only browser reads remain unchanged.
commit;
