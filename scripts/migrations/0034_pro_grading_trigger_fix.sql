-- 0034_pro_grading_trigger_fix.sql
--
-- Two fixes to enforce_pro_for_grading() from 0008:
-- 1. Its service-role bypass compared current_user, which inside a
--    SECURITY DEFINER function is always the owner, never 'service_role'.
--    So server writes that set a grade for a non-Pro user (CSV import,
--    admin tools) were rejected. Use the request's JWT role instead.
-- 2. A lapsed Pro user with a grade on file couldn't change anything on
--    that row (status, notes, price) because the check fired on any
--    non-null gated field. Now it fires only when a gated field is set or
--    changed to a non-null value. Clearing is always allowed.
-- Idempotent; the trigger binding from 0008 is unchanged.

begin;

create or replace function public.enforce_pro_for_grading()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  is_pro_user boolean;
  is_founding boolean;
  touches_gated boolean;
begin
  -- Server writes through PostgREST carry a service_role JWT.
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;
  -- SQL-editor maintenance: logged in as postgres with no JWT claims.
  -- (current_user can't be used here; in a SECURITY DEFINER function it is
  -- always the owner.) A test that sets role and claims still gets checked.
  if session_user in ('postgres', 'supabase_admin')
     and nullif(current_setting('request.jwt.claims', true), '') is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    touches_gated := new.grade_numeric is not null
                  or new.slab_company is not null
                  or new.slab_cert_number is not null
                  or new.user_cover_url is not null;
  else
    touches_gated := (new.grade_numeric is distinct from old.grade_numeric and new.grade_numeric is not null)
                  or (new.slab_company is distinct from old.slab_company and new.slab_company is not null)
                  or (new.slab_cert_number is distinct from old.slab_cert_number and new.slab_cert_number is not null)
                  or (new.user_cover_url is distinct from old.user_cover_url and new.user_cover_url is not null);
  end if;

  if not touches_gated then
    return new;
  end if;

  select coalesce(is_pro, false), coalesce(is_founding_collector, false)
    into is_pro_user, is_founding
    from public.profiles
   where id = new.user_id;

  if not (coalesce(is_pro_user, false) or coalesce(is_founding, false)) then
    raise exception 'Pro tier required to set grade, slab, cert, or per-book photo fields'
      using errcode = '42501', hint = 'Upgrade to Collector Pro at /upgrade';
  end if;

  return new;
end;
$$;

commit;

-- Rollback: re-run scripts/migrations/0008_pro_grading_trigger.sql
