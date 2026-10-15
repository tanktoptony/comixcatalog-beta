-- Rollback: alter the column back to text.
alter table tiny_audit_log alter column detail type varchar(200);
