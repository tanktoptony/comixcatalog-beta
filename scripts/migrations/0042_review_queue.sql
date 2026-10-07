-- Review queue (2026-10-07).
--
-- Tony approves or denies what users add to the shared catalog. Two kinds of
-- submission, both start pending and only show to everyone once approved:
--   1. issue_printings: a variant / newsstand / reprint reported for an issue,
--      now with the photo from a cover scan as its proposed cover.
--   2. comics: books users add by hand or by CSV when we don't have them.
--      Until now these were public the moment they were created.
-- The submitter always keeps seeing their own pending rows.

alter table issue_printings
  add column if not exists kind text,
  add column if not exists photo_path text,   -- private cover-scans path of the submitted photo
  add column if not exists cover_url text,    -- public URL, set only when approved
  add column if not exists scan_id uuid references cover_scans (id) on delete set null,
  add column if not exists reviewed_by uuid references auth.users (id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_note text;

alter table issue_printings drop constraint if exists issue_printings_kind;
alter table issue_printings add constraint issue_printings_kind
  check (kind is null or kind in ('variant', 'newsstand', 'reprint', 'other'));

create index if not exists issue_printings_pending_idx
  on issue_printings (created_at) where status = 'pending';

alter table comics
  add column if not exists review_status text not null default 'pending',
  add column if not exists reviewed_by uuid references auth.users (id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_note text;

alter table comics drop constraint if exists comics_review_status;
alter table comics add constraint comics_review_status
  check (review_status in ('pending', 'approved', 'denied'));

-- The 231 books that exist today were added before review existed and are
-- already public; keep them that way. Only books added from now on queue.
update comics set review_status = 'approved' where reviewed_at is null and review_status = 'pending';

create index if not exists comics_pending_idx
  on comics (created_at) where review_status = 'pending';
