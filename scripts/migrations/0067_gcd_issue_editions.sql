-- Column additions are metadata-only and have no defaults, avoiding a table rewrite.
begin;

alter table public.gcd_issues
  add column if not exists variant_of_gcd_id integer,
  add column if not exists variant_name text,
  add column if not exists base_gcd_issue_id integer;

create table public.catalog_import_issues (
  id bigserial primary key,
  run_at timestamptz default now(),
  source text,
  gcd_issue_id integer,
  reason text,
  detail text
);

create table public.catalog_imports (
  id bigserial primary key,
  source text,
  dump_date date,
  phase text,
  started_at timestamptz,
  finished_at timestamptz,
  counts jsonb
);

alter table public.catalog_import_issues enable row level security;
alter table public.catalog_imports enable row level security;

commit;

-- Run each statement outside a transaction. CONCURRENTLY cannot run in one.
create index concurrently if not exists gcd_issues_base_gcd_issue_id_idx
  on public.gcd_issues (base_gcd_issue_id);

create index concurrently if not exists gcd_issues_variant_of_gcd_id_idx
  on public.gcd_issues (variant_of_gcd_id);
