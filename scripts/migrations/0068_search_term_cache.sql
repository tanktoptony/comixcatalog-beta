-- 0068: persisted search term cache.
--
-- Search computed each term's full ranked result inside Next's unstable_cache
-- (10 min). Measured 2026-10-14: entries did not survive (superman was
-- recomputed in-request an hour after it was warmed, no deploy in between),
-- and every recompute is the series RPC at 0.3-7 s under load. Logged-in
-- comics searches skipped the cache entirely.
--
-- One row per (kind, term). The app serves a row immediately, refreshes it
-- in the background once it is older than 10 minutes, and computes in the
-- request only when there is no row at all. Degraded results are never
-- stored. Rows not refreshed for 30 days are deleted on save.
--
-- Run alone.

begin;

set local lock_timeout = '5s';

create table if not exists public.search_term_cache (
  kind text not null,
  cache_key text not null,
  payload jsonb not null,
  computed_at timestamptz not null default now(),
  refresh_started_at timestamptz,
  primary key (kind, cache_key)
);

create index if not exists search_term_cache_computed_at_idx
  on public.search_term_cache (computed_at);

-- Service role only: no policies, so anon/authenticated see nothing.
alter table public.search_term_cache enable row level security;
revoke all on public.search_term_cache from anon, authenticated;

-- One background refresh per stale row: returns true for the first caller
-- and again only if that refresh has not finished within two minutes.
create or replace function public.claim_search_term_refresh(p_kind text, p_key text)
returns boolean
language sql
volatile
set search_path = public
as $$
  with claimed as (
    update public.search_term_cache c
       set refresh_started_at = now()
     where c.kind = p_kind
       and c.cache_key = p_key
       and (c.refresh_started_at is null or c.refresh_started_at < now() - interval '2 minutes')
    returning 1
  )
  select exists (select 1 from claimed);
$$;

create or replace function public.save_search_term(p_kind text, p_key text, p_payload jsonb)
returns void
language sql
volatile
set search_path = public
as $$
  insert into public.search_term_cache (kind, cache_key, payload, computed_at, refresh_started_at)
  values (p_kind, p_key, p_payload, now(), null)
  on conflict (kind, cache_key) do update
    set payload = excluded.payload,
        computed_at = excluded.computed_at,
        refresh_started_at = null;
  delete from public.search_term_cache
   where computed_at < now() - interval '30 days';
$$;

revoke all on function public.claim_search_term_refresh(text, text) from public, anon, authenticated;
revoke all on function public.save_search_term(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.claim_search_term_refresh(text, text) to service_role;
grant execute on function public.save_search_term(text, text, jsonb) to service_role;
grant select on public.search_term_cache to service_role;

commit;

notify pgrst, 'reload schema';

-- Rollback:
--   drop function if exists public.save_search_term(text, text, jsonb);
--   drop function if exists public.claim_search_term_refresh(text, text);
--   drop table if exists public.search_term_cache;
