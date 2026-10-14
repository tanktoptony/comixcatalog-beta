create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
grant usage on schema public, auth to anon, authenticated, service_role;

create table auth.users (
  id uuid primary key,
  email text,
  email_confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

create or replace function auth.uid() returns uuid language sql stable as $$
  select (nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid
$$;
create or replace function auth.role() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role'
$$;

create table public.profiles (
  id uuid primary key references auth.users(id),
  username text,
  is_public boolean default true,
  show_for_sale boolean default true
);
create table public.comics (
  id uuid primary key default gen_random_uuid(),
  series_title text, issue_number text, release_year int4, publisher text
);
create table public.user_collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  gcd_issue_id int4,
  comic_id uuid references public.comics(id),
  status text not null,
  variant_label text,
  copy_number int4 default 1,
  condition text,
  grade_numeric numeric(3,1),
  slab_company text,
  slab_cert_number text,
  notes text,
  purchase_price numeric,
  market_value numeric,
  auto_market_value numeric,
  auto_market_value_n int4,
  user_cover_url text,
  created_at timestamptz not null default now(),
  check (gcd_issue_id is not null or comic_id is not null)
);

create or replace function public.listing_snapshot(p_gcd_issue_id int4)
returns table (series_title text, issue_number text, release_year int4, publisher text)
language sql stable as $$ select 'Fixture Series'::text, p_gcd_issue_id::text, 2026, 'Fixture Publisher'::text $$;

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references auth.users(id) on delete cascade,
  collection_id uuid not null references public.user_collections(id) on delete cascade,
  gcd_issue_id int4 not null,
  status text not null default 'active' check (status in ('draft','active','reserved','sold','withdrawn','removed')),
  series_title text not null,
  issue_number text,
  release_year int4,
  publisher text,
  variant_label text,
  cover_path text,
  snapshot_refreshed_at timestamptz,
  condition text,
  grade_numeric numeric(3,1),
  slab_company text,
  slab_cert_number text,
  condition_notes text,
  restored boolean not null default false,
  signed boolean not null default false,
  price_cents int4,
  currency text not null default 'usd',
  accepts_offers boolean not null default true,
  shipping_cents int4,
  ships_from_region text,
  reserved_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sold_at timestamptz
);
create unique index listings_one_active_per_copy on public.listings(collection_id) where status in ('draft','active','reserved');

create table public.listing_photos (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references public.listings(id) on delete cascade,
  collection_id uuid not null references public.user_collections(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null, thumb_path text not null,
  width int4, height int4, bytes int4, kind text, sort_order int2 default 0,
  created_at timestamptz not null default now()
);
create table public.user_blocks (
  blocker_id uuid references auth.users(id), blocked_id uuid references auth.users(id),
  primary key (blocker_id, blocked_id)
);
create table public.reports (
  id uuid primary key default gen_random_uuid(), reporter_id uuid references auth.users(id),
  target_type text not null, target_id uuid not null, reason text not null, details text,
  status text default 'open', created_at timestamptz default now(),
  constraint reports_target_type_check check (target_type in ('listing','message','user','photo','sale'))
);

create or replace function public.sync_listing_from_collection() returns trigger language plpgsql as $$
begin
  if new.status <> 'for_sale' then
    update public.listings set status = 'withdrawn', updated_at = now()
      where collection_id = new.id and status in ('draft','active');
  end if;
  return new;
end;
$$;
create trigger user_collections_sync_listing after update of status, gcd_issue_id, condition, grade_numeric, slab_company, slab_cert_number, variant_label
  on public.user_collections for each row execute function public.sync_listing_from_collection();

create table public.sold_items (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id) on delete cascade,
  buyer_id uuid references public.profiles(id) on delete set null,
  collection_item_id uuid not null,
  listing_id uuid,
  gcd_issue_id int4,
  comic_id uuid,
  series_title text not null,
  issue_number text,
  release_year int4,
  publisher text,
  variant_label text,
  copy_number int4,
  condition text,
  grade_numeric numeric(3,1),
  slab_company text,
  slab_cert_number text,
  notes text,
  purchase_price numeric,
  market_value numeric,
  user_cover_url text,
  seller_photo_keys jsonb not null default '[]',
  listing_snapshot jsonb not null default '{}',
  sale_price numeric(10,2) not null,
  currency text not null default 'USD',
  sold_at timestamptz not null default now(),
  sold_via text not null constraint sold_items_sold_via_check check (sold_via in ('comixcatalog_message','offsite')),
  status text not null default 'recorded' check (status in ('recorded','pending_buyer','confirmed','disputed','expired')),
  created_at timestamptz not null default now(),
  check (gcd_issue_id is not null or comic_id is not null)
);

create function public.mark_item_sold(uuid,uuid,numeric,text,uuid default null) returns uuid
language sql as $$ select gen_random_uuid() $$;

create or replace function public.confirm_sale_transfer(p_sale_id uuid, p_buyer_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare sale public.sold_items%rowtype; new_id uuid; next_copy int4;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'service role required' using errcode = '42501'; end if;
  select * into sale from public.sold_items where id = p_sale_id for update;
  if not found then raise exception 'purchase not found' using errcode = 'P0002'; end if;
  if sale.buyer_id is distinct from p_buyer_id then raise exception 'buyer required' using errcode = '42501'; end if;
  if sale.status <> 'pending_buyer' then raise exception 'purchase is not pending' using errcode = '22023'; end if;
  select coalesce(max(copy_number),0)+1 into next_copy from public.user_collections where user_id=p_buyer_id and gcd_issue_id=sale.gcd_issue_id;
  insert into public.user_collections(user_id,gcd_issue_id,comic_id,status,variant_label,copy_number,condition,grade_numeric,slab_company,slab_cert_number,purchase_price,user_cover_url)
    values(p_buyer_id,sale.gcd_issue_id,sale.comic_id,'owned',sale.variant_label,next_copy,sale.condition,sale.grade_numeric,sale.slab_company,sale.slab_cert_number,sale.sale_price,sale.user_cover_url)
    returning id into new_id;
  update public.sold_items set status='confirmed' where id=sale.id;
  return new_id;
end;
$$;
