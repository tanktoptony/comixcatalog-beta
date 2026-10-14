-- 0069: persisted library hydration, per catalog item.
--
-- /api/library-hydrate turns a list of books into titles, covers, years and
-- market values. Measured 2026-10-14: 1-5 s per library (13-20 s for the
-- largest under load), paid on every visit without a browser copy (a new
-- device, a phone, after signing out). Each book's catalog card and each
-- (issue, grade) value are the same for every collector, so they are stored
-- here once and shared:
--   cache_key 'gcd-<gcd_issue_id>' or '<comic uuid>'  -> the item card
--   cache_key 'mv:<gcd_issue_id>:<grade>:<slab>:<condition>' -> a value
-- The route serves stored entries, recomputes in the request only what is
-- missing, and refreshes entries older than 10 minutes in the background.
-- Rows not refreshed in 30 days are deleted on save. Service role only.
--
-- Run alone.

begin;

set local lock_timeout = '5s';

create table if not exists public.library_item_cache (
  cache_key text primary key,
  payload jsonb not null,
  computed_at timestamptz not null default now()
);

create index if not exists library_item_cache_computed_at_idx
  on public.library_item_cache (computed_at);

alter table public.library_item_cache enable row level security;
revoke all on public.library_item_cache from anon, authenticated;
grant select on public.library_item_cache to service_role;

-- p_rows: [{ "key": text, "payload": jsonb }, ...]
create or replace function public.save_library_items(p_rows jsonb)
returns void
language sql
volatile
set search_path = public
as $$
  insert into public.library_item_cache (cache_key, payload, computed_at)
  select distinct on (r.key) r.key, r.payload, now()
  from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as r(key text, payload jsonb)
  where r.key is not null and r.payload is not null
  order by r.key
  on conflict (cache_key) do update
    set payload = excluded.payload,
        computed_at = excluded.computed_at;
  delete from public.library_item_cache
   where computed_at < now() - interval '30 days';
$$;

revoke all on function public.save_library_items(jsonb) from public, anon, authenticated;
grant execute on function public.save_library_items(jsonb) to service_role;

commit;

notify pgrst, 'reload schema';

-- Rollback:
--   drop function if exists public.save_library_items(jsonb);
--   drop table if exists public.library_item_cache;
