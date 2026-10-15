-- Rollback:
-- Restore public.claim_founding_pass(uuid) from
-- scripts/migrations/0061_founding_claims.sql, then drop
-- public.founding_inbox_taken(uuid) and public.normalize_email(text).

begin;

create or replace function public.normalize_email(p_email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when pg_catalog.strpos(pg_catalog.btrim(pg_catalog.lower(coalesce(p_email, ''))), '@') = 0
      then pg_catalog.btrim(pg_catalog.lower(coalesce(p_email, '')))
    else
      case when domain_part in ('gmail.com', 'googlemail.com')
        then pg_catalog.replace(local_part, '.', '') || '@gmail.com'
        else local_part || '@' || domain_part
      end
  end
  from (
    select
      pg_catalog.split_part(pg_catalog.split_part(email, '@', 1), '+', 1) as local_part,
      pg_catalog.split_part(email, '@', 2) as domain_part
    from (select pg_catalog.btrim(pg_catalog.lower(coalesce(p_email, ''))) as email) normalized
  ) parts
$$;

-- True when another founding collector's sign-in email normalizes to the same
-- inbox as this user's (or this user has no email). Used inside the locked
-- claim below and by the claim route's preflight, so both apply one rule.
create or replace function public.founding_inbox_taken(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select exists (
      select 1
      from public.profiles p
      join auth.users u on u.id = p.id
      where p.is_founding_collector
        and p.id <> p_user_id
        and public.normalize_email(u.email) = public.normalize_email(claimant.email)
    )
    from auth.users claimant
    where claimant.id = p_user_id and claimant.email is not null
  ), true)
$$;

revoke all on function public.founding_inbox_taken(uuid) from public, anon, authenticated;
grant execute on function public.founding_inbox_taken(uuid) to service_role;

create or replace function public.claim_founding_pass(p_user_id uuid)
returns table (claimed boolean, pass_number int, remaining int, already boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  founder_count int;
  founder_created_at timestamptz;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('founding_pass_cap'));

  select p.created_at into founder_created_at
  from public.profiles p
  where p.id = p_user_id and p.is_founding_collector;

  select count(*)::int into founder_count
  from public.profiles p
  where p.is_founding_collector;

  if founder_created_at is not null then
    return query select true,
      (select count(*)::int + 1 from public.profiles p
       where p.is_founding_collector and p.created_at < founder_created_at),
      greatest(0, 100 - founder_count), true;
    return;
  end if;

  if public.founding_inbox_taken(p_user_id) then
    return query select false, null::int, greatest(0, 100 - founder_count), false;
    return;
  end if;

  if founder_count >= 100 then
    return query select false, null::int, 0, false;
    return;
  end if;

  -- SECURITY DEFINER runs this update as the function owner (postgres when
  -- applied in the Supabase SQL editor), which is explicitly allowed by the
  -- protect_profile_billing_columns trigger from migration 0032a.
  update public.profiles p
  set is_pro = true, is_founding_collector = true
  where p.id = p_user_id
  returning p.created_at into founder_created_at;

  if founder_created_at is null then
    return query select false, null::int, 100 - founder_count, false;
    return;
  end if;

  founder_count := founder_count + 1;
  return query select true,
    (select count(*)::int + 1 from public.profiles p
     where p.is_founding_collector and p.created_at < founder_created_at),
    100 - founder_count, false;
end;
$$;

revoke all on function public.claim_founding_pass(uuid) from public, anon, authenticated;
grant execute on function public.claim_founding_pass(uuid) to service_role;

commit;
