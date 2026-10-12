-- Make collection-to-listing failures observable without ever blocking the
-- collection write. The audit RPC is service-role only so neither this table
-- nor its diagnostics are exposed to browser clients.

create table if not exists public.listing_sync_failures (
  id uuid primary key default gen_random_uuid(),
  collection_item_id uuid not null,
  user_id uuid not null,
  gcd_issue_id int4,
  error_message text not null,
  sqlstate text not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists listing_sync_failures_unresolved_idx
  on public.listing_sync_failures (created_at desc)
  where resolved_at is null;

alter table public.listing_sync_failures enable row level security;

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
  -- This handler is part of an implicit subtransaction: failed listing work
  -- is rolled back before the diagnostic is written. The nested handler is
  -- essential. Even a failure while logging must still return NEW so a
  -- marketplace bug can never abort the user's collection write.
  begin
    insert into public.listing_sync_failures (
      collection_item_id, user_id, gcd_issue_id, error_message, sqlstate
    ) values (
      new.id, new.user_id, new.gcd_issue_id, sqlerrm, sqlstate
    );
  exception when others then
    raise warning 'sync_listing_from_collection(%) logging failed: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

create or replace function public.check_listing_sync(p_repair boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
  repaired_count bigint := 0;
begin
  with missing as (
    select uc.id, uc.user_id, uc.gcd_issue_id
    from public.user_collections uc
    where uc.status = 'for_sale'
      and not exists (
        select 1 from public.listings l
        where l.collection_id = uc.id and l.status = 'active'
      )
  ),
  missing_examples as (
    select * from missing order by id limit 50
  ),
  failure_examples as (
    select id, collection_item_id, user_id, gcd_issue_id, error_message,
           sqlstate, created_at
    from public.listing_sync_failures
    where resolved_at is null
    order by created_at desc
    limit 10
  )
  select jsonb_build_object(
    'missing_count', (select count(*) from missing),
    'missing_examples', coalesce((select jsonb_agg(to_jsonb(m)) from missing_examples m), '[]'::jsonb),
    'unresolved_failure_count', (select count(*) from public.listing_sync_failures where resolved_at is null),
    'latest_failures', coalesce((select jsonb_agg(to_jsonb(f)) from failure_examples f), '[]'::jsonb)
  ) into result;

  if p_repair then
    update public.user_collections uc
    set status = uc.status
    where uc.status = 'for_sale'
      and not exists (
        select 1 from public.listings l
        where l.collection_id = uc.id and l.status = 'active'
      );
    get diagnostics repaired_count = row_count;

    update public.listing_sync_failures f
    set resolved_at = now()
    where f.resolved_at is null
      and exists (
        select 1 from public.listings l
        where l.collection_id = f.collection_item_id and l.status = 'active'
      );
  end if;

  return result || jsonb_build_object('repair_attempted', p_repair, 'repair_rows_touched', repaired_count);
end;
$$;

revoke all on table public.listing_sync_failures from public, anon, authenticated;
revoke all on function public.check_listing_sync(boolean) from public, anon, authenticated;
grant execute on function public.check_listing_sync(boolean) to service_role;

-- Verification (run in a transaction): force the listing insert to fail and
-- verify the collection update survives while a diagnostic is recorded.
-- begin;
-- alter table public.listings add constraint listing_sync_verify_fail check (status <> 'active') not valid;
-- update public.user_collections set status = 'for_sale' where id = '<collection uuid>';
-- select status from public.user_collections where id = '<collection uuid>'; -- for_sale
-- select * from public.listing_sync_failures where collection_item_id = '<collection uuid>' order by created_at desc limit 1;
-- rollback;

-- Verification query:
-- select public.check_listing_sync(false);

-- Rollback:
-- drop function if exists public.check_listing_sync(boolean);
-- drop table if exists public.listing_sync_failures;
-- Reapply sync_listing_from_collection() from 0031_marketplace_listings.sql.
