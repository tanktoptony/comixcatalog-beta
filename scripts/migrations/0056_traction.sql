-- Database-backed acquisition and activation instrumentation.
begin;

alter table public.profiles
  add column if not exists signup_source text,
  add column if not exists signup_medium text,
  add column if not exists signup_campaign text,
  add column if not exists signup_referrer_host text,
  add column if not exists signup_landing_path text,
  add column if not exists milestones jsonb not null default '{}'::jsonb;

create or replace function public.protect_profile_billing_columns()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin')
     or coalesce(auth.role(), '') = 'service_role' then return new; end if;
  if tg_op = 'INSERT' then
    if coalesce(new.is_pro, false) or coalesce(new.is_founding_collector, false)
       or new.stripe_customer_id is not null or new.membership_tier is not null
       or new.signup_source is not null or new.signup_medium is not null
       or new.signup_campaign is not null or new.signup_referrer_host is not null
       or new.signup_landing_path is not null or new.milestones <> '{}'::jsonb then
      raise exception 'server-managed profile columns cannot be changed' using errcode = '42501';
    end if;
  elsif new.is_pro is distinct from old.is_pro
     or new.is_founding_collector is distinct from old.is_founding_collector
     or new.stripe_customer_id is distinct from old.stripe_customer_id
     or new.membership_tier is distinct from old.membership_tier
     or new.signup_source is distinct from old.signup_source
     or new.signup_medium is distinct from old.signup_medium
     or new.signup_campaign is distinct from old.signup_campaign
     or new.signup_referrer_host is distinct from old.signup_referrer_host
     or new.signup_landing_path is distinct from old.signup_landing_path
     or new.milestones is distinct from old.milestones then
    raise exception 'server-managed profile columns cannot be changed' using errcode = '42501';
  end if;
  return new;
end; $$;

-- Atomic count + claim. Only service-role callers receive execute permission.
create or replace function public.claim_collection_milestones(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_count integer; v_old jsonb; v_new jsonb; v_claimed text[] := '{}';
begin
  select milestones into v_old from public.profiles where id = p_user_id for update;
  if not found then raise exception 'profile not found'; end if;
  select count(*)::integer into v_count from public.user_collections
    where user_id = p_user_id and status in ('owned', 'for_sale');
  v_new := coalesce(v_old, '{}'::jsonb);
  if v_count >= 1 and not (v_new ? 'first_comic_added') then
    v_new := v_new || '{"first_comic_added":true}'::jsonb;
    v_claimed := array_append(v_claimed, 'first_comic_added');
  end if;
  if v_count >= 25 and not (v_new ? 'collection_25') then
    v_new := v_new || '{"collection_25":true}'::jsonb;
    v_claimed := array_append(v_claimed, 'collection_25');
  end if;
  update public.profiles set milestones = v_new where id = p_user_id;
  return jsonb_build_object('count', v_count, 'claimed', to_jsonb(v_claimed));
end; $$;
revoke all on function public.claim_collection_milestones(uuid) from public, anon, authenticated;
grant execute on function public.claim_collection_milestones(uuid) to service_role;

create or replace function public.traction_report(p_excluded_usernames text[] default '{}')
returns jsonb language sql security definer set search_path = '' stable as $$
with members as (
  select p.id, p.username, p.created_at, coalesce(p.signup_source, 'unknown') source,
    u.last_sign_in_at,
    count(c.id) filter (where c.status in ('owned','for_sale'))::int book_count,
    max(c.created_at) filter (where c.status in ('owned','for_sale')) last_add,
    bool_or(c.created_at >= p.created_at + interval '24 hours'
      and c.created_at < p.created_at + interval '30 days') as returned_by_add
  from public.profiles p join auth.users u on u.id = p.id
  left join public.user_collections c on c.user_id = p.id
  where not (lower(p.username) = any(p_excluded_usernames))
  group by p.id, p.username, p.created_at, p.signup_source, u.last_sign_in_at
), weeks as (
  select generate_series(date_trunc('week', now()) - interval '11 weeks',
    date_trunc('week', now()), interval '1 week') week_start
), cohorts as (
  select w.week_start, count(m.id)::int signups,
    count(m.id) filter (where book_count >= 1)::int first_books,
    count(m.id) filter (where book_count >= 25)::int collections_25,
    count(m.id) filter (where returned_by_add or (last_sign_in_at >= m.created_at + interval '24 hours'
      and last_sign_in_at < m.created_at + interval '30 days'))::int returned_30d
  from weeks w left join members m on m.created_at >= w.week_start and m.created_at < w.week_start + interval '1 week'
  group by w.week_start order by w.week_start
), sources as (
  select source, count(*)::int signups, count(*) filter (where book_count >= 1)::int first_books,
    count(*) filter (where book_count >= 25)::int collections_25 from members group by source order by count(*) desc
), stalls as (
  select username, created_at signup_date, source from members
  where created_at between now() - interval '14 days' and now() - interval '1 day' and book_count = 0
  order by created_at
)
select jsonb_build_object(
  'generated_at', now(),
  'north_star', (select count(*) from members where book_count >= 25
    and greatest(coalesce(last_sign_in_at, '-infinity'), coalesce(last_add, '-infinity')) >= now() - interval '30 days'),
  'cohorts', (select coalesce(jsonb_agg(jsonb_build_object(
    'week_start', week_start, 'signups', signups, 'first_books', first_books, 'collections_25', collections_25,
    'first_book_pct', case when signups=0 then 0 else round(first_books*100.0/signups,1) end,
    'collection_25_pct', case when signups=0 then 0 else round(collections_25*100.0/signups,1) end,
    'returned_30d_pct', case when signups=0 then 0 else round(returned_30d*100.0/signups,1) end
  ) order by week_start), '[]') from cohorts),
  'sources', (select coalesce(jsonb_agg(to_jsonb(s)), '[]') from sources s),
  'stalls', (select coalesce(jsonb_agg(to_jsonb(s)), '[]') from stalls s)
); $$;
revoke all on function public.traction_report(text[]) from public, anon, authenticated;
grant execute on function public.traction_report(text[]) to service_role;

commit;
