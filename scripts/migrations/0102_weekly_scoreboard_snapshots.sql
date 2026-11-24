begin;

create table if not exists public.weekly_scoreboard_snapshots (
  week_start date primary key,
  metrics jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.weekly_scoreboard_snapshots enable row level security;
revoke all on public.weekly_scoreboard_snapshots from anon, authenticated;

-- Aggregate in Postgres so the two large reporting tables are never pulled
-- through PostgREST. This function only reads application data and is callable
-- by the service role used by the Monday report.
create or replace function public.weekly_scoreboard_metrics(
  p_week_start date,
  p_run_at timestamptz,
  p_excluded_usernames text[] default '{}'::text[]
) returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with eligible as (
    select p.id, p.username, p.created_at, p.is_founding_collector,
      p.is_pro, p.membership_tier
    from profiles p
    where lower(coalesce(p.username, '')) <> all(p_excluded_usernames)
  ), collection_counts as (
    select uc.user_id,
      count(*) filter (where uc.status in ('owned', 'for_sale'))::int owned,
      count(*) filter (where uc.status = 'wishlist')::int wanted
    from user_collections uc join eligible e on e.id = uc.user_id
    group by uc.user_id
  ), collections as (
    select
      count(*) filter (where uc.status in ('owned', 'for_sale'))::int owned_rows,
      count(*) filter (where uc.status = 'wishlist')::int want_rows,
      count(distinct uc.user_id) filter (
        where uc.created_at >= p_run_at - interval '7 days'
          and uc.status in ('owned', 'for_sale', 'wishlist')
      )::int active_collectors
    from user_collections uc join eligible e on e.id = uc.user_id
  ), want_coverage as (
    select
      count(*) filter (where exists (
        select 1 from listings l
        where l.gcd_issue_id = uc.gcd_issue_id and l.status = 'active'
          and l.seller_id <> uc.user_id
      ))::int native_listing,
      count(*) filter (where exists (
        select 1 from market_comps mc
        where mc.gcd_issue_id = uc.gcd_issue_id and mc.source = 'ebay-listed'
          and mc.fetched_at >= p_run_at - interval '30 days'
      ))::int ebay_copy
    from user_collections uc join eligible e on e.id = uc.user_id
    where uc.status = 'wishlist' and uc.gcd_issue_id is not null
  ), listing_counts as (
    select
      count(*)::int active,
      count(*) filter (where l.price_cents > 0)::int priced,
      count(*) filter (where l.price_cents > 0 and lower(e.username) <> 'tanktop__')::int priced_other
    from listings l join eligible e on e.id = l.seller_id
    where l.status = 'active'
  ), real_orders as (
    select
      count(*)::int all_time,
      count(*) filter (where o.paid_at >= p_run_at - interval '7 days')::int last_7d,
      coalesce(sum(o.total_cents), 0)::bigint gmv,
      coalesce(sum(o.platform_fee_cents), 0)::bigint fees
    from orders o join eligible buyer on buyer.id = o.buyer_id
    where o.livemode is true and o.paid_at is not null
      and coalesce(o.refunded_cents, 0) = 0
      and lower(buyer.username) <> 'tanktop__'
  ), scan_counts as (
    select
      count(*) filter (where cs.created_at >= p_run_at - interval '7 days')::int scans_7d,
      count(*) filter (where cs.created_at >= p_run_at - interval '7 days' and cs.outcome = 'matched')::int matched_7d,
      count(*) filter (where cs.chosen_gcd_issue_id is not null)::int confirmed,
      count(*) filter (where cs.chosen_gcd_issue_id is not null
        and cs.chosen_gcd_issue_id = nullif(cs.candidates->0->>'gcd_issue_id', '')::int)::int top_1
    from cover_scans cs join eligible e on e.id = cs.user_id
  )
  select jsonb_build_object(
    'members', (select count(*)::int from eligible),
    'newMembers7d', (select count(*)::int from eligible where created_at >= p_run_at - interval '7 days'),
    'founders', (select count(*)::int from eligible where is_founding_collector is true),
    -- Paid means Collector+ or Pro, excluding founders. Stripe keeps these
    -- flags current for active or trialing subscriptions; legacy comped Pro
    -- accounts remain included because the product uses the same is_pro flag.
    'payingMembers', (select count(*)::int from eligible where is_founding_collector is not true
      and (membership_tier = 'collector_plus' or is_pro is true)),
    'withBook', (select count(*)::int from collection_counts where owned >= 1),
    'with25', (select count(*)::int from collection_counts where owned >= 25),
    'withWantlist', (select count(*)::int from collection_counts where wanted >= 1),
    'activeCollectors7d', (select active_collectors from collections),
    'ownedRows', (select owned_rows from collections),
    'wantRows', (select want_rows from collections),
    'wantsWithNativeListing', (select native_listing from want_coverage),
    'wantsWithEbayCopy', (select ebay_copy from want_coverage),
    'activeListings', (select active from listing_counts),
    'pricedListings', (select priced from listing_counts),
    'pricedListingsOtherSellers', (select priced_other from listing_counts),
    'realOrders7d', (select last_7d from real_orders),
    'realOrdersAllTime', (select all_time from real_orders),
    'gmvAllTimeCents', (select gmv from real_orders),
    'platformFeesAllTimeCents', (select fees from real_orders),
    'scans7d', (select scans_7d from scan_counts),
    'scanMatched7d', (select matched_7d from scan_counts),
    'scanConfirmedAllTime', (select confirmed from scan_counts),
    'scanConfirmTop1', (select top_1 from scan_counts),
    'follows', (select count(*)::int from follows f
      join eligible a on a.id = f.follower_id join eligible b on b.id = f.followee_id),
    'pullListSeries', (select count(*)::int from pull_list_series pls join eligible e on e.id = pls.user_id)
  );
$$;

revoke all on function public.weekly_scoreboard_metrics(date, timestamptz, text[]) from public, anon, authenticated;
grant execute on function public.weekly_scoreboard_metrics(date, timestamptz, text[]) to service_role;

commit;

-- Rollback:
-- drop function if exists public.weekly_scoreboard_metrics(date, timestamptz, text[]);
-- drop table if exists public.weekly_scoreboard_snapshots;
