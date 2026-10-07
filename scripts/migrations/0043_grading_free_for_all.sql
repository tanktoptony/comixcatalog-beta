-- 0043_grading_free_for_all.sql
-- Professional grading, slab and cert details, and per-copy photos are now
-- available to every signed-in collector. Remove the database-level Pro gate
-- added by 0008 and corrected by 0034 so free accounts can save these fields.

begin;

drop trigger if exists enforce_pro_for_grading_trg on public.user_collections;
drop function if exists public.enforce_pro_for_grading();

commit;

-- Rollback: re-run scripts/migrations/0008_pro_grading_trigger.sql then scripts/migrations/0034_pro_grading_trigger_fix.sql
