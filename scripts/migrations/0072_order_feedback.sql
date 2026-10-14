-- Marketplace transactions PR e: two-way order feedback and seller ratings.

begin;

create table if not exists public.order_feedback (
  order_id uuid not null references public.orders(id) on delete restrict,
  author_id uuid not null references auth.users(id) on delete restrict,
  subject_id uuid not null references auth.users(id) on delete restrict,
  author_role text not null check (author_role in ('buyer', 'seller')),
  rating smallint not null check (rating in (-1, 0, 1)),
  comment text not null default '' check (comment = btrim(comment) and char_length(comment) <= 500),
  created_at timestamptz not null default now(),
  visible_at timestamptz not null,
  removed_at timestamptz,
  removed_by uuid references auth.users(id) on delete restrict,
  removed_reason text,
  standing_checked_at timestamptz,
  primary key (order_id, author_id),
  check (author_id <> subject_id),
  check ((removed_at is null and removed_by is null and removed_reason is null)
    or (removed_at is not null and removed_by is not null
      and char_length(btrim(removed_reason)) between 3 and 500))
);

create index if not exists order_feedback_seller_stats_idx
  on public.order_feedback (subject_id, created_at desc)
  where removed_at is null and author_role = 'buyer';

create index if not exists order_feedback_standing_sweep_idx
  on public.order_feedback (visible_at, subject_id)
  where standing_checked_at is null and removed_at is null and author_role = 'buyer';

alter table public.order_feedback enable row level security;
drop policy if exists order_feedback_public_visible on public.order_feedback;
create policy order_feedback_public_visible on public.order_feedback
  for select to anon, authenticated
  using (visible_at <= now() and removed_at is null);
drop policy if exists order_feedback_author_select on public.order_feedback;
create policy order_feedback_author_select on public.order_feedback
  for select to authenticated
  using (author_id = auth.uid());

revoke all on public.order_feedback from public, anon, authenticated;
grant select (order_id, author_id, subject_id, author_role, rating, comment, created_at, visible_at)
  on public.order_feedback to authenticated;
grant select (order_id, author_id, subject_id, author_role, rating, comment, created_at)
  on public.order_feedback to anon;
grant all on public.order_feedback to service_role;

create or replace function public.mkt_counted_seller_feedback(p_sellers uuid[])
returns table (
  seller_id uuid,
  author_id uuid,
  rating smallint,
  comment text,
  created_at timestamptz,
  order_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (f.subject_id, f.author_id, date_trunc('month', f.created_at))
    f.subject_id,
    f.author_id,
    f.rating,
    f.comment,
    f.created_at,
    f.order_id
  from public.order_feedback f
  join public.orders o on o.id = f.order_id
  where f.subject_id = any(p_sellers)
    and f.author_role = 'buyer'
    and f.visible_at <= now()
    and f.removed_at is null
    and f.created_at >= now() - interval '12 months'
    and o.buyer_id <> o.seller_id
    and o.total_cents >= 500
  order by f.subject_id, f.author_id, date_trunc('month', f.created_at), f.created_at desc
$$;

revoke all on function public.mkt_counted_seller_feedback(uuid[]) from public, anon, authenticated;
grant execute on function public.mkt_counted_seller_feedback(uuid[]) to service_role;

create or replace function public.mkt_seller_rating(p_seller uuid) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with ratings as (
    select * from public.mkt_counted_seller_feedback(array[p_seller])
  ), totals as (
    select
      count(*)::int as count,
      count(*) filter (where rating = 1)::int as positive,
      count(*) filter (where rating = 0)::int as neutral,
      count(*) filter (where rating = -1)::int as negative
    from ratings
  )
  select jsonb_build_object(
    'count', count,
    'positive', positive,
    'neutral', neutral,
    'negative', negative,
    'percent_positive', case when count = 0 then null
      else round(positive::numeric * 100 / count, 0) end
  )
  from totals
$$;

create or replace function public.mkt_seller_ratings(p_sellers uuid[])
returns table (seller_id uuid, count int, percent_positive numeric)
language sql
stable
security definer
set search_path = public
as $$
  select requested.seller_id,
    count(r.rating)::int,
    case when count(r.rating) = 0 then null
      else round(count(r.rating) filter (where r.rating = 1)::numeric * 100 / count(r.rating), 0) end
  from unnest(p_sellers) as requested(seller_id)
  left join public.mkt_counted_seller_feedback(p_sellers) r
    on r.seller_id = requested.seller_id
  group by requested.seller_id
$$;

grant execute on function public.mkt_seller_rating(uuid) to anon, authenticated, service_role;
grant execute on function public.mkt_seller_ratings(uuid[]) to anon, authenticated, service_role;

create or replace function public.mkt_apply_feedback_standing(p_seller uuid) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_seller public.seller_accounts%rowtype;
  updated_seller public.seller_accounts%rowtype;
  recent_count int;
  recent_positive int;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  select * into current_seller
  from public.seller_accounts
  where user_id = p_seller
  for update;
  if not found or current_seller.tier not in ('new', 'established') then
    return false;
  end if;

  select count(*)::int,
    count(*) filter (where rating = 1)::int
  into recent_count, recent_positive
  from (
    select rating
    from public.mkt_counted_seller_feedback(array[p_seller])
    order by created_at desc
    limit 20
  ) recent;

  if recent_count < 20 or recent_positive::numeric / recent_count >= 0.90 then
    return false;
  end if;

  update public.seller_accounts
  set tier = 'limited',
    tier_reason = 'auto: feedback below 90%',
    updated_at = now()
  where user_id = p_seller
    and tier in ('new', 'established')
  returning * into updated_seller;

  if not found then
    return false;
  end if;

  insert into public.marketplace_audit_log
    (actor_role, entity, entity_id, action, before, after)
  values
    ('system', 'seller', p_seller, 'tier_limited_feedback',
      to_jsonb(current_seller), to_jsonb(updated_seller));
  return true;
end;
$$;

create or replace function public.order_leave_feedback(
  p_order uuid,
  p_author uuid,
  p_rating int,
  p_comment text
) returns public.order_feedback
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.orders%rowtype;
  result public.order_feedback%rowtype;
  other_exists boolean;
  role_name text;
  subject uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_rating not in (-1, 0, 1) then
    raise exception 'rating must be -1, 0, or 1' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_comment, ''))) > 500 then
    raise exception 'comment must be 500 characters or fewer' using errcode = '22023';
  end if;

  select * into order_row from public.orders where id = p_order for update;
  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;
  if p_author = order_row.buyer_id then
    role_name := 'buyer';
    subject := order_row.seller_id;
  elsif p_author = order_row.seller_id then
    role_name := 'seller';
    subject := order_row.buyer_id;
  else
    raise exception 'order party required' using errcode = '42501';
  end if;
  if order_row.status <> 'completed' or order_row.completed_at is null then
    raise exception 'completed order required' using errcode = '55000';
  end if;
  if now() > order_row.completed_at + interval '60 days' then
    raise exception 'feedback window closed' using errcode = '55000';
  end if;

  select exists (
    select 1 from public.order_feedback
    where order_id = p_order and author_id <> p_author
  ) into other_exists;

  insert into public.order_feedback
    (order_id, author_id, subject_id, author_role, rating, comment, visible_at)
  values
    (p_order, p_author, subject, role_name, p_rating,
      btrim(coalesce(p_comment, '')),
      case when other_exists then now() else now() + interval '14 days' end)
  returning * into result;

  if other_exists then
    update public.order_feedback
    set visible_at = now()
    where order_id = p_order;
    select * into result from public.order_feedback
    where order_id = p_order and author_id = p_author;
  end if;

  insert into public.marketplace_audit_log
    (actor_id, actor_role, entity, entity_id, action, after)
  values
    (p_author, role_name, 'feedback', p_order, 'feedback_left',
      to_jsonb(result) - 'comment');

  if other_exists then
    perform public.mkt_apply_feedback_standing(order_row.seller_id);
    update public.order_feedback
    set standing_checked_at = now()
    where order_id = p_order
      and author_role = 'buyer';
  end if;
  return result;
end;
$$;

create or replace function public.admin_remove_feedback(
  p_admin uuid,
  p_order uuid,
  p_author uuid,
  p_reason text
) returns public.order_feedback
language plpgsql
security definer
set search_path = public
as $$
declare
  old_row public.order_feedback%rowtype;
  result public.order_feedback%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise exception 'reason must be 3 to 500 characters' using errcode = '22023';
  end if;
  select * into old_row from public.order_feedback
  where order_id = p_order and author_id = p_author for update;
  if not found then
    raise exception 'feedback not found' using errcode = 'P0002';
  end if;
  update public.order_feedback
  set removed_at = now(),
    removed_by = p_admin,
    removed_reason = btrim(p_reason)
  where order_id = p_order and author_id = p_author
  returning * into result;
  insert into public.marketplace_audit_log
    (actor_id, actor_role, entity, entity_id, action, before, after)
  values
    (p_admin, 'admin', 'feedback', p_order, 'feedback_removed',
      to_jsonb(old_row), to_jsonb(result));
  return result;
end;
$$;

create or replace function public.mkt_feedback_sweep() returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  seller uuid;
  checked int;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  for seller in
    select distinct subject_id
    from public.order_feedback
    where author_role = 'buyer'
      and removed_at is null
      and visible_at <= now()
      and standing_checked_at is null
  loop
    perform public.mkt_apply_feedback_standing(seller);
  end loop;
  update public.order_feedback
  set standing_checked_at = now()
  where author_role = 'buyer'
    and removed_at is null
    and visible_at <= now()
    and standing_checked_at is null;
  get diagnostics checked = row_count;
  return checked;
end;
$$;

revoke all on function public.order_leave_feedback(uuid, uuid, int, text) from public, anon, authenticated;
revoke all on function public.admin_remove_feedback(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.mkt_apply_feedback_standing(uuid) from public, anon, authenticated;
revoke all on function public.mkt_feedback_sweep() from public, anon, authenticated;
grant execute on function public.order_leave_feedback(uuid, uuid, int, text) to service_role;
grant execute on function public.admin_remove_feedback(uuid, uuid, uuid, text) to service_role;
grant execute on function public.mkt_apply_feedback_standing(uuid) to service_role;
grant execute on function public.mkt_feedback_sweep() to service_role;

commit;

-- Failure-mode checks:
-- set local role authenticated; select public.order_leave_feedback(...); -- 42501
-- leave feedback as a non-party, before completion, or after 60 days; -- 42501/55000
-- leave feedback twice for one author and order; -- 23505
-- select hidden feedback as anon or the other party; -- zero rows
-- remove feedback with a two-character reason; -- 22023 and row unchanged
-- call mkt_feedback_sweep twice; -- the second call returns 0
