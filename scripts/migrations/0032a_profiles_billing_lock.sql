-- 0032a_profiles_billing_lock.sql
--
-- Owners could grant themselves Pro. The "Users can update own profile"
-- policy (auth.uid() = id) has no column restriction and authenticated
-- holds UPDATE on is_pro / is_founding_collector / stripe_customer_id
-- (confirmed live 2026-10-05). Same for INSERT via "Users can insert own
-- profile".
--
-- A trigger rather than column REVOKEs: Supabase grants table-level
-- privileges, and a column REVOKE does nothing while a table grant exists.
-- SECURITY INVOKER on purpose, so current_user is the real caller.
--
-- Safe to apply before or after the code deploy. Idempotent.

begin;

create or replace function public.protect_profile_billing_columns()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Server writes: the service role (Stripe webhook, admin toggle) and the
  -- postgres owner (SQL editor, the new-user trigger on auth.users).
  if current_user in ('service_role', 'postgres', 'supabase_admin')
     or coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if coalesce(new.is_pro, false)
       or coalesce(new.is_founding_collector, false)
       or new.stripe_customer_id is not null then
      raise exception 'billing columns are server-managed' using errcode = '42501';
    end if;
  elsif new.is_pro is distinct from old.is_pro
     or new.is_founding_collector is distinct from old.is_founding_collector
     or new.stripe_customer_id is distinct from old.stripe_customer_id then
    raise exception 'billing columns are server-managed' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_profile_billing_columns_trg on public.profiles;
create trigger protect_profile_billing_columns_trg
  before insert or update on public.profiles
  for each row execute function public.protect_profile_billing_columns();

commit;

-- Rollback:
--   drop trigger if exists protect_profile_billing_columns_trg on public.profiles;
--   drop function if exists public.protect_profile_billing_columns();
