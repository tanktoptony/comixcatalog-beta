-- Reported printings (2026-09-25).
--
-- Discogs splits a record into a Master (the work) and Releases (each
-- physical pressing: country, year, label, catalogue number). A different
-- pressing is not a duplicate there, it is a new Release under the same
-- Master, and it is identified by something printed on the object — the
-- catalogue number and the barcode.
--
-- Comics have the same structure. The issue is the Master. The newsstand,
-- the direct edition, the second print and the Cover B are Releases. What we
-- did not have is their catalogue number: gcd_issues carries gcd_id,
-- series_gcd_id, issue_number, title, publication_date, key_date and
-- publisher_gcd_id, and nothing a collector can read off the book itself.
--
-- This table is that missing half, and it is deliberately NOT a column on
-- gcd_issues. That table is a mirror of GCD, refreshed by
-- refreshGcdIssuesFromApi.js; community data does not belong inside it, for
-- the same reason Discogs keeps submissions separate from released facts.
-- Provenance stays legible: every row says who reported it and when.
--
-- Measured before building this, on 2026-09-25:
--   cover_variants        40,019 rows
--   owned distinct issues     668, of which 59 (8.8%) have any variant on file
--   user_collections.variant_label set on 2 of 738 rows
--
-- So the gap is not that collectors cannot pick a printing we hold. It is
-- that for nine issues in ten we hold nothing for them to pick. This table
-- collects what they tell us, which is the only way that number moves.

create table if not exists issue_printings (
  id uuid primary key default gen_random_uuid(),
  gcd_issue_id integer not null,

  -- What the collector calls it: "Newsstand", "Cover B", "2nd Print",
  -- "1:25 Ferry Variant". Free text on purpose — the vocabulary is not
  -- settled and guessing a taxonomy now would throw away the real answer.
  printing_name text,

  -- The barcode on the back. The one identifier a phone can read, which is
  -- what makes a scan-to-add flow possible later. Digits only; the check
  -- allows UPC-A (12) and EAN-13, plus the 5-digit supplement comics print
  -- next to it, which encodes the issue and cover variant.
  upc text,

  notes text,

  submitted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),

  -- Nothing is promoted into the catalog automatically. 27 users cannot
  -- out-vote a bad edit the way Discogs' millions can, so review is a person
  -- looking, not a quorum.
  status text not null default 'pending',

  constraint issue_printings_has_content
    check (coalesce(printing_name, '') <> '' or coalesce(upc, '') <> ''),
  constraint issue_printings_upc_shape
    check (upc is null or upc ~ '^[0-9]{12,18}$'),
  constraint issue_printings_status
    check (status in ('pending', 'accepted', 'rejected', 'duplicate'))
);

-- One report of a given printing per issue per person. Someone correcting
-- their own entry updates it; two people reporting the same Cover B is one
-- row, not two.
-- submitted_by is only ever null after the account is deleted; the insert
-- policy requires it to equal auth.uid(). So a null here cannot create a
-- duplicate report, it can only orphan an old one.
create unique index if not exists issue_printings_unique_report
  on issue_printings (
    gcd_issue_id,
    submitted_by,
    lower(coalesce(printing_name, '')),
    coalesce(upc, '')
  );

create index if not exists issue_printings_gcd_issue_id_idx
  on issue_printings (gcd_issue_id);

-- A barcode lookup has to be fast for a scan flow to feel like a scan.
create index if not exists issue_printings_upc_idx
  on issue_printings (upc)
  where upc is not null;

alter table issue_printings enable row level security;

-- Accepted reports are catalog data and readable by anyone. A pending one is
-- visible only to the person who sent it, so a half-read barcode does not
-- show up on a public issue page as though we had verified it.
create policy "accepted printings are publicly readable"
  on issue_printings for select
  using (status = 'accepted' or auth.uid() = submitted_by);

create policy "signed-in users can report a printing"
  on issue_printings for insert
  with check (auth.uid() = submitted_by);

create policy "you can correct your own pending report"
  on issue_printings for update
  using (auth.uid() = submitted_by and status = 'pending')
  with check (auth.uid() = submitted_by and status = 'pending');

create policy "you can withdraw your own report"
  on issue_printings for delete
  using (auth.uid() = submitted_by);
