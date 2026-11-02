begin;
-- Serves the signed-in shelf value card through the existing
-- collection_value_history_user_date_idx (user_id, snapshot_date desc).
alter table public.collection_value_history add column if not exists priced_count integer;
commit;

-- Rollback: alter table public.collection_value_history drop column if exists priced_count;
