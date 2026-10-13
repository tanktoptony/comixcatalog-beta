begin;

create table public.series_links (
  id bigserial primary key,
  from_gcd_id integer not null,
  to_gcd_id integer not null,
  kind text not null check (kind in ('continues', 'collected_in')),
  source text not null check (source in ('gcd_bond', 'curated')),
  gcd_bond_type text null,
  note text null,
  created_at timestamptz not null default now(),
  unique (from_gcd_id, to_gcd_id, kind)
);

create index series_links_to_gcd_id_idx
  on public.series_links (to_gcd_id);

alter table public.series_links enable row level security;

grant select on public.series_links to anon, authenticated;

create policy "Catalog series links are publicly readable"
  on public.series_links
  for select
  to anon, authenticated
  using (true);

insert into public.series_links
  (from_gcd_id, to_gcd_id, kind, source, note)
values
  (26099, 52493, 'continues', 'curated',
   'Amory Wars II continues the story. Together they are The Second Stage Turbine Blade.'),
  (26099, 51788, 'collected_in', 'curated', null),
  (52493, 51788, 'collected_in', 'curated', null);

commit;

-- Rollback:
--   drop table if exists public.series_links;
