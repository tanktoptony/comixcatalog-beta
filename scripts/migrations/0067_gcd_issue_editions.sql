-- Column additions are metadata-only and have no defaults, avoiding a table rewrite.
begin;

alter table public.gcd_issues
  add column if not exists variant_of_gcd_id integer,
  add column if not exists variant_name text,
  add column if not exists base_gcd_issue_id integer;

create table if not exists public.catalog_import_issues (
  id bigserial primary key,
  run_at timestamptz default now(),
  source text,
  gcd_issue_id integer,
  reason text,
  detail text
);

create table if not exists public.catalog_imports (
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

-- Plain (not concurrent) so the whole file is one paste. The columns are new
-- and all null, so each build is one quick scan of gcd_issues.
create index if not exists gcd_issues_base_gcd_issue_id_idx
  on public.gcd_issues (base_gcd_issue_id);

create index if not exists gcd_issues_variant_of_gcd_id_idx
  on public.gcd_issues (variant_of_gcd_id);

commit;
