-- 0079: key_rulings, the record of every editorial call on key issues.
--
-- Each row is one judgment on one issue: promoted to major, demoted to minor,
-- ruled not a key, reason corrected, or added. `before` / `after` hold the
-- key_issues row as it was / became, so any ruling can be undone. Issue pages
-- read the latest ruling to show "Our ruling" with its note (a book people
-- ask about that we decided is not a key keeps its explanation here even
-- though its key_issues row is gone).
--
-- APPLIED IN PROD 2026-10-18.

begin;

create table if not exists public.key_rulings (
  id bigserial primary key,
  gcd_issue_id integer not null,
  key_issue_id uuid,
  action text not null check (action in ('promote', 'demote', 'remove', 'fix_reason', 'add')),
  verdict text check (verdict in ('major', 'minor', 'not_key')),
  note text not null,
  before jsonb,
  after jsonb,
  ruled_at timestamptz not null default now(),
  reverted_at timestamptz
);

create index if not exists key_rulings_gcd_issue_idx on public.key_rulings (gcd_issue_id, ruled_at desc);

alter table public.key_rulings enable row level security;

-- Catalog data, readable like key_issues; writes only through the service role.
drop policy if exists "key_rulings are publicly readable" on public.key_rulings;
create policy "key_rulings are publicly readable" on public.key_rulings for select using (true);
grant select on public.key_rulings to anon, authenticated;
revoke insert, update, delete, truncate on public.key_rulings from anon, authenticated;

commit;

-- Rollback:
-- drop table if exists public.key_rulings;
