-- Index the main UPC/EAN separately from its optional 2- or 5-digit add-on.
-- A stored generated column keeps every write path consistent. Adding it
-- rewrites this table once, which is bounded at roughly 430k small rows, and
-- avoids a trigger and a nullable backfill that could leave lookup gaps.
alter table issue_printings
  drop constraint if exists issue_printings_upc_shape;

alter table issue_printings
  add constraint issue_printings_upc_shape
  check (upc is null or upc ~ '^[0-9]{12,13}([0-9]{2}|[0-9]{5})?$');

alter table issue_printings
  add column if not exists upc_main text generated always as (
    case
      when char_length(upc) in (12, 14, 17) then left(upc, 12)
      when char_length(upc) in (13, 15, 18) then left(upc, 13)
      else null
    end
  ) stored;

create index if not exists issue_printings_upc_main_accepted_idx
  on issue_printings (upc_main)
  where status = 'accepted' and upc_main is not null;

alter table pending_barcode_reads
  drop constraint if exists pending_barcode_reads_upc_check;

alter table pending_barcode_reads
  add constraint pending_barcode_reads_upc_check
  check (upc ~ '^[0-9]{12,13}([0-9]{2}|[0-9]{5})?$');
