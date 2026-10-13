-- 0061_founding_claims.sql
-- Email ownership proof and an atomic cap for Founding Collector passes.

begin;

create table if not exists public.founding_claim_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token_hash text not null,
  email text not null,
  created_at timestamptz not null default now(),
  sent_count int not null default 1,
  last_sent_at timestamptz not null default now(),
  confirmed_at timestamptz null
);

create unique index if not exists founding_claim_tokens_token_hash_idx
  on public.founding_claim_tokens (token_hash);

alter table public.founding_claim_tokens enable row level security;
revoke all on public.founding_claim_tokens from anon, authenticated;

create or replace function public.claim_founding_pass(p_user_id uuid)
returns table (claimed boolean, pass_number int, remaining int, already boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  founder_count int;
  founder_created_at timestamptz;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('founding_pass_cap'));

  select p.created_at into founder_created_at
  from public.profiles p
  where p.id = p_user_id and p.is_founding_collector;

  select count(*)::int into founder_count
  from public.profiles p
  where p.is_founding_collector;

  if founder_created_at is not null then
    return query select true,
      (select count(*)::int + 1 from public.profiles p
       where p.is_founding_collector and p.created_at < founder_created_at),
      pg_catalog.greatest(0, 100 - founder_count), true;
    return;
  end if;

  if founder_count >= 100 then
    return query select false, null::int, 0, false;
    return;
  end if;

  -- SECURITY DEFINER runs this update as the function owner (postgres when
  -- applied in the Supabase SQL editor), which is explicitly allowed by the
  -- protect_profile_billing_columns trigger from migration 0032a.
  update public.profiles p
  set is_pro = true, is_founding_collector = true
  where p.id = p_user_id
  returning p.created_at into founder_created_at;

  if founder_created_at is null then
    return query select false, null::int, 100 - founder_count, false;
    return;
  end if;

  founder_count := founder_count + 1;
  return query select true,
    (select count(*)::int + 1 from public.profiles p
     where p.is_founding_collector and p.created_at < founder_created_at),
    100 - founder_count, false;
end;
$$;

revoke all on function public.claim_founding_pass(uuid) from public, anon, authenticated;
grant execute on function public.claim_founding_pass(uuid) to service_role;

commit;

-- Rollback:
-- drop function if exists public.claim_founding_pass(uuid);
-- drop table if exists public.founding_claim_tokens;
