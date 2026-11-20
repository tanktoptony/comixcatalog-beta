-- 0110_patron_badge.sql (applied to prod 2026-11-20 as 0109; renumbered after main took 0109)
-- Patron badge for Patreon supporters. Set by hand from /admin (no Patreon
-- API link), shown on public profiles. Like membership_tier, it is readable
-- by everyone and writable only by server roles, so members can't grant it
-- to themselves.
--
-- Apply this BEFORE deploying the code that reads it: /api/public-profile
-- selects the column, and a missing column would break profile pages.

-- Rollback:
--   revoke select (is_patron) on public.profiles from anon, authenticated;
--   recreate protect_profile_billing_columns() without the two is_patron
--   checks (copy the live definition first), then
--   alter table public.profiles drop column is_patron;

begin;

alter table public.profiles
  add column if not exists is_patron boolean not null default false;

-- Copied from the live definition (read 2026-11-20 with pg_get_functiondef),
-- with is_patron added to both branches. Keep every existing column.
create or replace function public.protect_profile_billing_columns()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin')
     or coalesce(auth.role(), '') = 'service_role' then return new; end if;
  if tg_op = 'INSERT' then
    if coalesce(new.is_pro, false) or coalesce(new.is_founding_collector, false)
       or new.stripe_customer_id is not null or new.membership_tier is not null
       or new.signup_source is not null or new.signup_medium is not null
       or new.signup_campaign is not null or new.signup_referrer_host is not null
       or new.signup_landing_path is not null or new.milestones <> '{}'::jsonb
       or new.invited_by is not null or coalesce(new.is_patron, false) then
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
     or new.invited_by is distinct from old.invited_by
     or new.is_patron is distinct from old.is_patron then
    raise exception 'server-managed profile columns cannot be changed' using errcode = '42501';
  end if;
  return new;
end; $function$;

grant select (is_patron) on public.profiles to anon, authenticated;

commit;

-- Check (expect true, true, true):
-- select has_column_privilege('anon', 'public.profiles', 'is_patron', 'SELECT') as can_select,
--        position('is_patron' in pg_get_functiondef('public.protect_profile_billing_columns'::regproc)) > 0 as guarded,
--        position('invited_by' in pg_get_functiondef('public.protect_profile_billing_columns'::regproc)) > 0 as kept_invited_by;
