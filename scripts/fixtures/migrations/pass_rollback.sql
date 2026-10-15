-- Rollback:
-- Drop the column added below.
alter table tiny_audit_log add column if not exists note text;
