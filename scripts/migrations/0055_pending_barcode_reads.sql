-- Unknown live barcode reads. They stay private and pending until a catalog
-- issue can be attached during review.
create table if not exists pending_barcode_reads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  upc text not null check (upc ~ '^[0-9]{12,18}$'),
  created_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  read_count integer not null default 1 check (read_count > 0),
  status text not null default 'pending' check (status in ('pending', 'matched', 'ignored')),
  matched_gcd_issue_id integer
);

create unique index if not exists pending_barcode_reads_user_upc_pending_idx
  on pending_barcode_reads (user_id, upc) where status = 'pending';
create index if not exists pending_barcode_reads_pending_idx
  on pending_barcode_reads (last_read_at desc) where status = 'pending';

alter table pending_barcode_reads enable row level security;
drop policy if exists "users can read their pending barcode reads" on pending_barcode_reads;
create policy "users can read their pending barcode reads"
  on pending_barcode_reads for select using (auth.uid() = user_id);
