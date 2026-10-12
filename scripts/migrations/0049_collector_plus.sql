-- 0049_collector_plus.sql
-- Add the paid supporter tier without changing legacy Pro or founding access.
-- Collector+ is readable on public profiles but only server roles may write it.

begin;

alter table public.profiles
  add column if not exists membership_tier text null;

alter table public.profiles
  drop constraint if exists profiles_membership_tier_check;
alter table public.profiles
  add constraint profiles_membership_tier_check
  check (membership_tier in ('collector_plus'));

create or replace function public.protect_profile_billing_columns()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin')
     or coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if coalesce(new.is_pro, false)
       or coalesce(new.is_founding_collector, false)
       or new.stripe_customer_id is not null
       or new.membership_tier is not null then
      raise exception 'billing columns are server-managed' using errcode = '42501';
    end if;
  elsif new.is_pro is distinct from old.is_pro
     or new.is_founding_collector is distinct from old.is_founding_collector
     or new.stripe_customer_id is distinct from old.stripe_customer_id
     or new.membership_tier is distinct from old.membership_tier then
    raise exception 'billing columns are server-managed' using errcode = '42501';
  end if;

  return new;
end;
$$;

-- Additive only: the column list from 0032b stays as it is.
grant select (membership_tier) on public.profiles to anon, authenticated;

commit;

-- Check (expect true, true, true; the trigger blocks non-server writes):
-- select has_column_privilege('authenticated', 'public.profiles', 'membership_tier', 'SELECT') as can_select,
--        exists (select 1 from pg_trigger where tgname = 'protect_profile_billing_columns_trg' and tgenabled = 'O') as trigger_enabled,
--        exists (select 1 from pg_constraint where conname = 'profiles_membership_tier_check') as has_check;
