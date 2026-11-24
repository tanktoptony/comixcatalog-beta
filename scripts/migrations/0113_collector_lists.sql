-- Curated comic lists. All reads and writes go through service-role routes.

begin;

create table if not exists public.collector_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  description text check (description is null or char_length(description) <= 1000),
  is_public boolean not null default true,
  is_ranked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, slug)
);
create index if not exists collector_lists_user_idx
  on public.collector_lists (user_id, updated_at desc);
create index if not exists collector_lists_recent_idx
  on public.collector_lists (updated_at desc)
  where is_public;

create table if not exists public.collector_list_items (
  list_id uuid not null references public.collector_lists(id) on delete cascade,
  base_gcd_issue_id integer not null,
  position integer not null,
  note text check (note is null or char_length(note) <= 500),
  added_at timestamptz not null default now(),
  primary key (list_id, base_gcd_issue_id)
);
create index if not exists collector_list_items_issue_idx
  on public.collector_list_items (base_gcd_issue_id);
create index if not exists collector_list_items_order_idx
  on public.collector_list_items (list_id, position);

alter table public.collector_lists enable row level security;
alter table public.collector_list_items enable row level security;
revoke all on public.collector_lists from anon, authenticated;
revoke all on public.collector_list_items from anon, authenticated;

commit;

-- Rollback:
-- begin;
-- drop table if exists public.collector_list_items;
-- drop table if exists public.collector_lists;
-- commit;
