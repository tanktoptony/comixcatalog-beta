-- 0032b_profiles_hide_stripe_id.sql
--
-- anon and authenticated could read stripe_customer_id on every public
-- profile (the "Public profiles are viewable" policy is row-level only).
-- Only server routes using the service role need it.
--
-- RUN ONLY AFTER the PR that changed AuthContext.js from select("*") to an
-- explicit column list is deployed. Before that, this breaks profile
-- loading for every signed-in user.
--
-- A column REVOKE does nothing while a table-level SELECT exists, so the
-- table grant is replaced by a column list. If a column is added to
-- profiles later, add it here too or browsers can't read it.

begin;

revoke select on public.profiles from anon, authenticated;
grant select (
  id, username, is_public, created_at, avatar_key, avatar_url,
  is_founding_collector, is_pro, display_name, location, bio, website_url,
  show_collection, show_wantlist, show_for_sale, show_value
) on public.profiles to anon, authenticated;

commit;

-- Rollback:
--   grant select on public.profiles to anon, authenticated;
