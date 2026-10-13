-- Record the member whose invite brought a new profile to ComixCatalog.
-- This field is server-managed and may be set only once by /api/invites/accept.
--
-- protect_profile_billing_columns() is redefined here with invited_by added.
-- It is copied from its latest version (0056_traction.sql), NOT from 0032a:
-- 0049 added membership_tier and 0056 added the signup_* attribution columns
-- and milestones. Starting from an older copy would silently drop those and
-- let a signed-in user grant themselves Collector+. Any future migration that
-- touches this function must start from this file.

begin;

alter table public.profiles
  add column if not exists invited_by uuid references public.profiles(id) on delete set null;

create index if not exists profiles_invited_by_idx
  on public.profiles (invited_by);

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
       or new.signup_landing_path is not null or new.milestones <> '{}'::jsonb
       or new.invited_by is not null then
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
     or new.milestones is distinct from old.milestones
     or new.invited_by is distinct from old.invited_by then
    raise exception 'server-managed profile columns cannot be changed' using errcode = '42501';
  end if;
  return new;
end; $$;

commit;

-- Check after applying (expect true | true):
-- select exists (select 1 from information_schema.columns
--                 where table_schema = 'public' and table_name = 'profiles' and column_name = 'invited_by') as has_column,
--        position('membership_tier' in pg_get_functiondef('public.protect_profile_billing_columns'::regproc)) > 0
--        and position('invited_by' in pg_get_functiondef('public.protect_profile_billing_columns'::regproc)) > 0 as trigger_protects_both;
--
-- Rollback:
--   drop index if exists public.profiles_invited_by_idx;
--   alter table public.profiles drop column if exists invited_by;
--   Then re-run the protect_profile_billing_columns() definition from
--   scripts/migrations/0056_traction.sql to restore the previous trigger.
