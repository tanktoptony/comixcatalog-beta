-- Key issues reference table (2026-08-30).
--
-- Backs a "featured" signal for /library and /u/[username] Top Shelf that
-- isn't price-only — see keyIssuesSeed.js for the curated source list and
-- resolveKeyIssues.js for how gcd_issue_id gets filled in.
--
-- Public SELECT: this is reference data (like canonical_covers), not
-- user-owned data. No RLS write policy — only the resolver script
-- (service-role key) writes to it.

create table if not exists key_issues (
  id uuid primary key default gen_random_uuid(),
  gcd_issue_id integer unique,
  title text not null,
  issue_number text not null,
  publisher text,
  year integer,
  character text,
  reason text not null,
  tier integer not null default 2,
  created_at timestamptz not null default now()
);

create index if not exists key_issues_gcd_issue_id_idx on key_issues (gcd_issue_id);

alter table key_issues enable row level security;

create policy "key_issues are publicly readable"
  on key_issues for select
  using (true);
