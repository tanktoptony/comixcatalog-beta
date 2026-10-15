-- Rollback: alter the column back to text.
alter table public.user_collections alter column notes type varchar(200);
