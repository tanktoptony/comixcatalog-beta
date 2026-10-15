-- Rollback: drop the index.
-- migration-check: allow
create index idx_gcd_issues_number on gcd_issues (number);
