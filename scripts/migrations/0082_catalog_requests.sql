begin;

create table public.catalog_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  issue_number text check (issue_number is null or char_length(issue_number) <= 20),
  publisher text check (publisher is null or char_length(publisher) <= 120),
  year integer check (year is null or year between 1890 and 2100),
  notes text check (notes is null or char_length(notes) <= 1000),
  barcode text check (barcode is null or char_length(barcode) <= 20),
  source text not null check (source in ('scan', 'barcode', 'search', 'no_results', 'direct')),
  search_term text check (search_term is null or char_length(search_term) <= 200),
  scan_id uuid references public.cover_scans(id) on delete set null,
  photo_path text,
  status text not null default 'open' check (status in ('open', 'added', 'already_there', 'declined')),
  resolved_gcd_issue_id bigint,
  resolved_series_id uuid,
  resolved_note text,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index catalog_requests_status_created_idx
  on public.catalog_requests(status, created_at);
create index catalog_requests_user_created_idx
  on public.catalog_requests(user_id, created_at desc);

alter table public.catalog_requests enable row level security;

create policy "Users can read own catalog requests"
  on public.catalog_requests for select
  using (auth.uid() = user_id);

commit;

-- Rollback:
-- drop table if exists public.catalog_requests;
