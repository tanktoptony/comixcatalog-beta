-- Marketplace v2, Phase 0: first-class listings (docs/marketplace-v2-build-brief.md §4.1, §5).
--
-- v1 treated a user_collections row with status 'for_sale' as the listing.
-- v2 gives each listed copy its own `listings` row that snapshots what
-- buyers see (title, issue, publisher, cover, grade), so browse is one
-- indexed query instead of hydrating every for-sale row on every read.
--
-- How the two stay in sync for now: the library still flips
-- user_collections.status from the browser, and the trigger below turns
-- that into a listing (status -> 'for_sale') or withdraws it (anything
-- else). The trigger fills the snapshot from SQL; the server then
-- refreshes the cover and the normalized publisher label
-- (src/lib/listings.js refreshListingSnapshots, because cover matching
-- only exists in JS) and stamps snapshot_refreshed_at.
--
-- Nobody but the service role and the trigger writes listings: there are
-- no insert/update/delete policies. Offers, orders and stripe_events land
-- with their own phases.
--
-- Apply via the Supabase SQL editor. Non-destructive: creates tables, a
-- view and a trigger, and backfills listings for existing for_sale rows.

create table if not exists public.listings (
  id                uuid primary key default gen_random_uuid(),
  seller_id         uuid not null references auth.users(id) on delete cascade,
  collection_id     uuid not null references public.user_collections(id) on delete cascade,
  gcd_issue_id      int4 not null,
  status            text not null default 'active'
                    check (status in ('draft','active','reserved','sold','withdrawn','removed')),
  -- Display snapshot. The trigger fills these from SQL; the server refresh
  -- replaces them with the same values the library and issue page show.
  series_title      text not null,
  issue_number      text,
  release_year      int4,
  publisher         text,
  variant_label     text,
  cover_path        text,                -- canonical-covers storage path
  snapshot_refreshed_at timestamptz,     -- null = cover/publisher not refreshed yet
  -- Condition, kept in step with the collection row while the listing is
  -- draft or active (frozen once reserved or sold).
  condition         text,
  grade_numeric     numeric(3,1),
  slab_company      text,
  slab_cert_number  text,
  condition_notes   text check (char_length(condition_notes) <= 2000),
  restored          boolean not null default false,
  signed            boolean not null default false,
  -- Pricing. price_cents null = offers only (every v1 listing).
  price_cents       int4 check (price_cents is null or price_cents between 100 and 10000000),
  currency          text not null default 'usd',
  accepts_offers    boolean not null default true,
  shipping_cents    int4 check (shipping_cents is null or shipping_cents between 0 and 100000),
  ships_from_region text,
  reserved_until    timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  sold_at           timestamptz
);

create unique index if not exists listings_one_active_per_copy
  on public.listings (collection_id) where status in ('draft','active','reserved');
create index if not exists listings_browse_idx
  on public.listings (status, publisher, series_title, created_at desc);
create index if not exists listings_issue_idx
  on public.listings (gcd_issue_id) where status = 'active';
create index if not exists listings_seller_idx
  on public.listings (seller_id, status);
create index if not exists listings_stale_snapshot_idx
  on public.listings (id) where snapshot_refreshed_at is null and status in ('draft','active','reserved');
create index if not exists listings_title_trgm_idx
  on public.listings using gin (series_title gin_trgm_ops);

create table if not exists public.listing_photos (
  id            uuid primary key default gen_random_uuid(),
  listing_id    uuid references public.listings(id) on delete cascade,
  collection_id uuid not null references public.user_collections(id) on delete cascade,
  owner_id      uuid not null references auth.users(id) on delete cascade,
  storage_path  text not null,
  thumb_path    text not null,
  width int4, height int4, bytes int4,
  kind          text check (kind in ('front','back','spine','interior','defect','slab_label','other')),
  sort_order    int2 not null default 0,
  moderation    text not null default 'ok' check (moderation in ('ok','flagged','removed')),
  created_at    timestamptz not null default now()
);
create index if not exists listing_photos_collection_idx on public.listing_photos (collection_id, sort_order);
create index if not exists listing_photos_listing_idx on public.listing_photos (listing_id);
create index if not exists listing_photos_owner_idx on public.listing_photos (owner_id);

create table if not exists public.user_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_no_self check (blocker_id <> blocked_id)
);
create index if not exists user_blocks_blocked_idx on public.user_blocks (blocked_id);

create table if not exists public.reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('listing','message','user','photo')),
  target_id   uuid not null,
  reason      text not null check (reason in ('spam','scam','harassment','counterfeit','misdescribed','prohibited','other')),
  details     text check (char_length(details) <= 1000),
  status      text not null default 'open' check (status in ('open','actioned','dismissed')),
  created_at  timestamptz not null default now()
);
create index if not exists reports_status_idx on public.reports (status, created_at desc);
create index if not exists reports_target_idx on public.reports (target_type, target_id);
create index if not exists reports_reporter_idx on public.reports (reporter_id, created_at desc);

-- ── RLS ──────────────────────────────────────────────────────────────────

alter table public.listings enable row level security;
alter table public.listing_photos enable row level security;
alter table public.user_blocks enable row level security;
alter table public.reports enable row level security;

-- A listing is public while active or reserved and its seller's profile is
-- public with the for-sale shelf showing (same rule as v1).
create policy "listings_select_public"
  on public.listings for select
  to anon, authenticated
  using (
    status in ('active','reserved')
    and exists (
      select 1 from public.profiles p
      where p.id = listings.seller_id
        and p.username is not null
        and p.is_public is not false
        and p.show_for_sale is not false
    )
  );

create policy "listings_select_own"
  on public.listings for select
  to authenticated
  using (auth.uid() = seller_id);

create policy "listing_photos_select_public"
  on public.listing_photos for select
  to anon, authenticated
  using (
    moderation = 'ok'
    and listing_id is not null
    and exists (select 1 from public.listings l where l.id = listing_photos.listing_id)
  );

create policy "listing_photos_select_own"
  on public.listing_photos for select
  to authenticated
  using (auth.uid() = owner_id);

create policy "user_blocks_select_own"
  on public.user_blocks for select
  to authenticated
  using (auth.uid() = blocker_id);

create policy "user_blocks_insert_own"
  on public.user_blocks for insert
  to authenticated
  with check (auth.uid() = blocker_id);

create policy "user_blocks_delete_own"
  on public.user_blocks for delete
  to authenticated
  using (auth.uid() = blocker_id);

-- Reports are filed through a rate-limited server route (Phase 2), so users
-- can only read their own here.
create policy "reports_select_own"
  on public.reports for select
  to authenticated
  using (auth.uid() = reporter_id);

-- ── Snapshot from SQL ────────────────────────────────────────────────────

-- First four-digit year in a GCD date string ('1963-03-00', '[March 1963]').
create or replace function public.listing_year_from(d text)
returns int4 language sql immutable as $$
  select substring(d from '((?:18|19|20)[0-9]{2})')::int4
$$;

-- Title, issue, year and publisher for a catalog issue, picked the way
-- /api/library-hydrate does (series row first, then GCD publisher).
create or replace function public.listing_snapshot(p_gcd_issue_id int4)
returns table (series_title text, issue_number text, release_year int4, publisher text)
language sql stable as $$
  select
    coalesce(s.title, gs.name, 'Untitled'),
    gi.issue_number,
    coalesce(public.listing_year_from(gi.publication_date::text), public.listing_year_from(gi.key_date::text)),
    coalesce(nullif(s.resolved_publisher_cached, 'Unknown Publisher'), pub.name, gp.name)
  from public.gcd_issues gi
  left join lateral (
    select s1.title, s1.resolved_publisher_cached, s1.publisher_id
    from public.series s1
    where s1.gcd_id = gi.series_gcd_id
    order by s1.created_at
    limit 1
  ) s on true
  left join public.publishers pub on pub.id = s.publisher_id
  left join public.gcd_series gs on gs.gcd_id = gi.series_gcd_id
  left join public.gcd_publishers gp on gp.gcd_id = gi.publisher_gcd_id
  where gi.gcd_id = p_gcd_issue_id
$$;

-- ── Keep listings in step with user_collections ──────────────────────────

create or replace function public.sync_listing_from_collection()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  snap record;
  existing public.listings%rowtype;
begin
  select * into existing
  from public.listings
  where collection_id = new.id and status in ('draft','active','reserved')
  limit 1;

  if new.status = 'for_sale' and new.gcd_issue_id is not null then
    if existing.id is null then
      select * into snap from public.listing_snapshot(new.gcd_issue_id);
      insert into public.listings (
        seller_id, collection_id, gcd_issue_id, status,
        series_title, issue_number, release_year, publisher, variant_label,
        condition, grade_numeric, slab_company, slab_cert_number
      ) values (
        new.user_id, new.id, new.gcd_issue_id, 'active',
        coalesce(snap.series_title, 'Untitled'), snap.issue_number, snap.release_year, snap.publisher, new.variant_label,
        new.condition, new.grade_numeric, new.slab_company, new.slab_cert_number
      );
    elsif existing.status <> 'reserved' then
      if existing.gcd_issue_id is distinct from new.gcd_issue_id then
        -- Relinked to a different catalog issue: re-snapshot and let the
        -- server refresh the cover again.
        select * into snap from public.listing_snapshot(new.gcd_issue_id);
        update public.listings set
          gcd_issue_id = new.gcd_issue_id,
          series_title = coalesce(snap.series_title, 'Untitled'),
          issue_number = snap.issue_number,
          release_year = snap.release_year,
          publisher = snap.publisher,
          cover_path = null,
          snapshot_refreshed_at = null
        where id = existing.id;
      end if;
      update public.listings set
        variant_label = new.variant_label,
        condition = new.condition,
        grade_numeric = new.grade_numeric,
        slab_company = new.slab_company,
        slab_cert_number = new.slab_cert_number,
        updated_at = now()
      where id = existing.id;
    end if;
  elsif existing.id is not null and existing.status in ('draft','active') then
    -- Taken off sale, moved to the wantlist, or unlinked from the catalog.
    -- A reserved listing is mid-checkout and is left for the checkout flow.
    update public.listings set status = 'withdrawn', updated_at = now()
    where id = existing.id;
  end if;

  return new;
exception when others then
  -- Never block a library edit because of the marketplace. The listing
  -- catches up on the next status change.
  raise warning 'sync_listing_from_collection(%): %', new.id, sqlerrm;
  return new;
end;
$$;

drop trigger if exists user_collections_sync_listing on public.user_collections;
create trigger user_collections_sync_listing
  after insert or update of status, gcd_issue_id, condition, grade_numeric, slab_company, slab_cert_number, variant_label
  on public.user_collections
  for each row execute function public.sync_listing_from_collection();

-- ── Public read model ────────────────────────────────────────────────────

-- Visible listings with the seller's username and the copy's estimated
-- value (seller's own value, else the eBay-comps auto value). Read by the
-- server with the service role; security_invoker keeps it honest if anyone
-- else ever queries it.
create or replace view public.marketplace_listings
with (security_invoker = on) as
select
  l.id, l.seller_id, l.collection_id, l.gcd_issue_id, l.status,
  l.series_title, l.issue_number, l.release_year, l.publisher, l.variant_label, l.cover_path,
  l.condition, l.grade_numeric, l.slab_company, l.slab_cert_number,
  l.price_cents, l.accepts_offers, l.shipping_cents,
  l.created_at,
  p.username as seller_username,
  uc.market_value, uc.auto_market_value, uc.auto_market_value_n
from public.listings l
join public.profiles p on p.id = l.seller_id
join public.user_collections uc on uc.id = l.collection_id
where l.status = 'active'
  and p.username is not null
  and p.is_public is not false
  and p.show_for_sale is not false;

-- ── Backfill ─────────────────────────────────────────────────────────────

insert into public.listings (
  seller_id, collection_id, gcd_issue_id, status,
  series_title, issue_number, release_year, publisher, variant_label,
  condition, grade_numeric, slab_company, slab_cert_number, created_at
)
select
  uc.user_id, uc.id, uc.gcd_issue_id, 'active',
  coalesce(snap.series_title, 'Untitled'), snap.issue_number, snap.release_year, snap.publisher, uc.variant_label,
  uc.condition, uc.grade_numeric, uc.slab_company, uc.slab_cert_number, uc.created_at
from public.user_collections uc
left join lateral public.listing_snapshot(uc.gcd_issue_id) snap on true
where uc.status = 'for_sale'
  and uc.gcd_issue_id is not null
  and not exists (
    select 1 from public.listings l
    where l.collection_id = uc.id and l.status in ('draft','active','reserved')
  );
