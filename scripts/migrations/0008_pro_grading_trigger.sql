-- 0008_pro_grading_trigger.sql
--
-- Server-side enforcement for the Pro grading gate.
--
-- The frontend (GradeEditor.js) hides numeric grade, slab company/cert, and
-- per-book photo upload behind an isPro check. That's a UX gate, not a
-- security gate — a free user could still write to those columns via a
-- direct supabase-js call from the browser. This trigger closes that:
-- if a row update or insert sets any Pro-gated field and the user isn't Pro,
-- the write is rejected at the database level.
--
-- Service-role writes (API routes using SUPABASE_SERVICE_ROLE_KEY) skip the
-- check, because legitimate server-side flows like CSV import and admin
-- tools need to set these fields without going through user-Pro validation.
--
-- Idempotent on re-run.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- Trigger function: reject Pro-gated field writes by non-Pro users.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_pro_for_grading()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  is_pro_user boolean;
  is_founding boolean;
BEGIN
  -- Service role bypasses entirely. Server-side API routes (PDF export, CSV
  -- import, admin tools) need to write these fields without user-Pro checks.
  IF current_user = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Only enforce when one of the Pro-gated fields is being set to a non-null
  -- value. Clearing a field (NEW.field IS NULL) is always allowed — a user
  -- demoted from Pro must still be able to remove their previously-set grade
  -- data if they wish.
  IF (NEW.grade_numeric IS NULL
      AND NEW.slab_company IS NULL
      AND NEW.slab_cert_number IS NULL
      AND NEW.user_cover_url IS NULL) THEN
    RETURN NEW;
  END IF;

  -- Look up the row owner's Pro status. Founding Collectors count as Pro.
  SELECT COALESCE(is_pro, false), COALESCE(is_founding_collector, false)
    INTO is_pro_user, is_founding
  FROM public.profiles
  WHERE id = NEW.user_id;

  IF NOT (COALESCE(is_pro_user, false) OR COALESCE(is_founding, false)) THEN
    RAISE EXCEPTION 'Pro tier required to set grade, slab, cert, or per-book photo fields'
      USING ERRCODE = '42501', HINT = 'Upgrade to Collector Pro at /upgrade';
  END IF;

  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- Attach the trigger to user_collections for both INSERT and UPDATE.
-- ─────────────────────────────────────────────────────────────────────────
-- The CREATE OR REPLACE on the function above re-binds the existing trigger
-- automatically, but the DROP + CREATE here keeps the migration idempotent
-- even if the trigger name has drifted.
DROP TRIGGER IF EXISTS enforce_pro_for_grading_trg ON public.user_collections;
CREATE TRIGGER enforce_pro_for_grading_trg
  BEFORE INSERT OR UPDATE ON public.user_collections
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_pro_for_grading();

COMMIT;
