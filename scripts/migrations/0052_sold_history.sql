-- 0052_sold_history.sql
-- Private, durable sale records. Marking a copy sold snapshots everything
-- needed to identify/recreate it, closes its listing, then removes it from
-- user_collections in one transaction.

begin;

create table if not exists public.sold_items (
  id                  uuid primary key default gen_random_uuid(),
  seller_id           uuid not null references public.profiles(id) on delete cascade,
  buyer_id            uuid references public.profiles(id) on delete set null,
  collection_item_id  uuid not null,
  listing_id           uuid,
  gcd_issue_id         int4,
  comic_id             uuid,
  series_title         text not null,
  issue_number         text,
  release_year         int4,
  publisher            text,
  variant_label        text,
  copy_number          int4,
  condition            text,
  grade_numeric        numeric(3,1),
  slab_company         text,
  slab_cert_number     text,
  notes                text,
  purchase_price       numeric,
  market_value         numeric,
  user_cover_url       text,
  seller_photo_keys    jsonb not null default '[]'::jsonb,
  listing_snapshot     jsonb not null default '{}'::jsonb,
  sale_price           numeric(10,2) not null check (sale_price > 0),
  currency             text not null default 'USD',
  sold_at              timestamptz not null default now(),
  sold_via             text not null default 'offsite'
                       check (sold_via in ('comixcatalog_message','offsite')),
  status               text not null default 'recorded'
                       check (status in ('recorded','pending_buyer','confirmed','disputed','expired')),
  created_at           timestamptz not null default now(),
  check (gcd_issue_id is not null or comic_id is not null)
);

create index if not exists sold_items_issue_sold_at_idx
  on public.sold_items (gcd_issue_id, sold_at desc);
create index if not exists sold_items_seller_sold_at_idx
  on public.sold_items (seller_id, sold_at desc);

alter table public.sold_items enable row level security;

drop policy if exists "sold_items_select_own" on public.sold_items;
create policy "sold_items_select_own"
  on public.sold_items for select
  to authenticated
  using (auth.uid() = seller_id);

-- There are intentionally no browser insert/update/delete policies.
-- The route calls this as service_role after independently authenticating
-- the caller. Checking the JWT role prevents authenticated clients from
-- invoking the SECURITY DEFINER function directly.
create or replace function public.mark_item_sold(
  p_seller_id uuid,
  p_collection_item_id uuid,
  p_sale_price numeric,
  p_sold_via text
)
returns uuid
language plpgsql
security definer
set search_path = public
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

  select * into item
  from public.user_collections
  where id = p_collection_item_id and user_id = p_seller_id
  for update;
  if not found then
    raise exception 'collection item not found' using errcode = 'P0002';
  end if;
  if item.status <> 'for_sale' then
    raise exception 'collection item is not for sale' using errcode = '22023';
  end if;

  select * into active_listing
  from public.listings
  where collection_id = item.id and seller_id = p_seller_id
    and status in ('draft', 'active', 'reserved')
  order by created_at desc
  limit 1
  for update;

  if item.gcd_issue_id is not null then
    select * into snap from public.listing_snapshot(item.gcd_issue_id);
  else
    select c.series_title, c.issue_number, c.release_year, c.publisher
      into snap
    from public.comics c where c.id = item.comic_id;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'storage_path', lp.storage_path,
    'thumb_path', lp.thumb_path,
    'kind', lp.kind,
    'sort_order', lp.sort_order,
    'width', lp.width,
    'height', lp.height,
    'bytes', lp.bytes
  ) order by lp.sort_order, lp.created_at), '[]'::jsonb)
  into photo_keys
  from public.listing_photos lp
  where lp.collection_id = item.id and lp.owner_id = p_seller_id;

  insert into public.sold_items (
    seller_id, collection_item_id, listing_id, gcd_issue_id, comic_id,
    series_title, issue_number, release_year, publisher, variant_label, copy_number,
    condition, grade_numeric, slab_company, slab_cert_number, notes,
    purchase_price, market_value, user_cover_url, seller_photo_keys,
    listing_snapshot, sale_price, sold_via
  ) values (
    p_seller_id, item.id, active_listing.id, item.gcd_issue_id, item.comic_id,
    coalesce(active_listing.series_title, snap.series_title, 'Untitled'),
    coalesce(active_listing.issue_number, snap.issue_number),
    coalesce(active_listing.release_year, snap.release_year),
    coalesce(active_listing.publisher, snap.publisher),
    item.variant_label, item.copy_number, item.condition, item.grade_numeric,
    item.slab_company, item.slab_cert_number, item.notes, item.purchase_price,
    item.market_value, item.user_cover_url, photo_keys,
    case when active_listing.id is null then '{}'::jsonb else
      to_jsonb(active_listing) - 'seller_id' - 'collection_id' end,
    p_sale_price, p_sold_via
  ) returning id into sold_id;

  if active_listing.id is not null then
    update public.listings
    set status = 'sold', sold_at = now(), updated_at = now()
    where id = active_listing.id;
  end if;

  -- Cascades remove the closed listing and listing_photos metadata. Their
  -- durable values were copied above; no storage objects are deleted here.
  delete from public.user_collections where id = item.id and user_id = p_seller_id;
  if not found then
    raise exception 'collection item changed during sale' using errcode = '40001';
  end if;

  return sold_id;
end;
$$;

revoke all on function public.mark_item_sold(uuid, uuid, numeric, text) from public, anon, authenticated;
grant execute on function public.mark_item_sold(uuid, uuid, numeric, text) to service_role;

commit;

-- Verification (run as service_role inside a transaction, then ROLLBACK):
--   select public.mark_item_sold('<owner>', '<for-sale-item>', 25.00, 'offsite');
--   select id, sale_price from public.sold_items where collection_item_id = '<for-sale-item>';
--   select id from public.user_collections where id = '<for-sale-item>'; -- 0 rows
--   select id from public.listings where collection_id = '<for-sale-item>'; -- 0 rows
-- Failure-mode checks:
--   select public.mark_item_sold('<non-owner>', '<for-sale-item>', 25.00, 'offsite'); -- P0002; nothing changes
--   select public.mark_item_sold('<owner>', '<for-sale-item>', 0, 'offsite'); -- 22023; nothing changes
--   set local role authenticated;
--   select public.mark_item_sold('<owner>', '<for-sale-item>', 25.00, 'offsite'); -- permission denied

-- Rollback:
--   begin;
--   drop function if exists public.mark_item_sold(uuid, uuid, numeric, text);
--   drop table if exists public.sold_items;
--   commit;
