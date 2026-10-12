-- Keep local-only for-sale books visible to sellers and operators without
-- treating them as listing-sync failures. The listing trigger intentionally
-- requires gcd_issue_id because marketplace listings must link to the catalog.

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
      and uc.gcd_issue_id is not null
      and not exists (
        select 1 from public.listings l
        where l.collection_id = uc.id and l.status = 'active'
      )
  ),
  missing_examples as (
    select * from missing order by id limit 50
  ),
  unlinked_for_sale as (
    select uc.id, uc.user_id, uc.comic_id
    from public.user_collections uc
    where uc.status = 'for_sale'
      and uc.gcd_issue_id is null
  ),
  unlinked_examples as (
    select * from unlinked_for_sale order by id limit 20
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
    'unlinked_for_sale_count', (select count(*) from unlinked_for_sale),
    'unlinked_examples', coalesce((select jsonb_agg(to_jsonb(u)) from unlinked_examples u), '[]'::jsonb),
    'unresolved_failure_count', (select count(*) from public.listing_sync_failures where resolved_at is null),
    'latest_failures', coalesce((select jsonb_agg(to_jsonb(f)) from failure_examples f), '[]'::jsonb)
  ) into result;

  if p_repair then
    update public.user_collections uc
    set status = uc.status
    where uc.status = 'for_sale'
      and uc.gcd_issue_id is not null
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

revoke all on function public.check_listing_sync(boolean) from public, anon, authenticated;
grant execute on function public.check_listing_sync(boolean) to service_role;

-- Verification:
-- select public.check_listing_sync(false);
-- Confirm that missing_count excludes local-only rows, unlinked_for_sale_count
-- includes them, and unlinked_examples contains at most 20 id/user_id/comic_id rows.

-- Rollback: restore the 0053 definition.
-- create or replace function public.check_listing_sync(p_repair boolean default false)
-- returns jsonb
-- language plpgsql
-- security definer
-- set search_path = public
-- as $$
-- declare
--   result jsonb;
--   repaired_count bigint := 0;
-- begin
--   with missing as (
--     select uc.id, uc.user_id, uc.gcd_issue_id
--     from public.user_collections uc
--     where uc.status = 'for_sale'
--       and not exists (
--         select 1 from public.listings l
--         where l.collection_id = uc.id and l.status = 'active'
--       )
--   ),
--   missing_examples as (
--     select * from missing order by id limit 50
--   ),
--   failure_examples as (
--     select id, collection_item_id, user_id, gcd_issue_id, error_message,
--            sqlstate, created_at
--     from public.listing_sync_failures
--     where resolved_at is null
--     order by created_at desc
--     limit 10
--   )
--   select jsonb_build_object(
--     'missing_count', (select count(*) from missing),
--     'missing_examples', coalesce((select jsonb_agg(to_jsonb(m)) from missing_examples m), '[]'::jsonb),
--     'unresolved_failure_count', (select count(*) from public.listing_sync_failures where resolved_at is null),
--     'latest_failures', coalesce((select jsonb_agg(to_jsonb(f)) from failure_examples f), '[]'::jsonb)
--   ) into result;
--
--   if p_repair then
--     update public.user_collections uc
--     set status = uc.status
--     where uc.status = 'for_sale'
--       and not exists (
--         select 1 from public.listings l
--         where l.collection_id = uc.id and l.status = 'active'
--       );
--     get diagnostics repaired_count = row_count;
--
--     update public.listing_sync_failures f
--     set resolved_at = now()
--     where f.resolved_at is null
--       and exists (
--         select 1 from public.listings l
--         where l.collection_id = f.collection_item_id and l.status = 'active'
--       );
--   end if;
--
--   return result || jsonb_build_object('repair_attempted', p_repair, 'repair_rows_touched', repaired_count);
-- end;
-- $$;
-- revoke all on function public.check_listing_sync(boolean) from public, anon, authenticated;
-- grant execute on function public.check_listing_sync(boolean) to service_role;
