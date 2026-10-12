-- 0057_activation_nudges.sql
-- The singleton shipped_at value is captured when this migration is applied.
-- Only profiles created at or after that instant can receive activation nudges.

begin;

alter table public.profiles
  add column if not exists email_tips boolean not null default true,
  add column if not exists nudge1_sent_at timestamptz null,
  add column if not exists nudge2_sent_at timestamptz null;

-- profiles SELECT is column-scoped (0032b). Members need their own preference
-- in /account, but the delivery timestamps remain service-only.
grant select (email_tips) on public.profiles to authenticated;
grant update (email_tips) on public.profiles to authenticated;

create table if not exists public.activation_nudge_settings (
  singleton boolean primary key default true check (singleton),
  shipped_at timestamptz not null
);

insert into public.activation_nudge_settings (singleton, shipped_at)
values (true, now())
on conflict (singleton) do nothing;

alter table public.activation_nudge_settings enable row level security;
revoke all on public.activation_nudge_settings from anon, authenticated;

create or replace function public.protect_activation_nudge_columns()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin')
     or coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  if new.nudge1_sent_at is distinct from old.nudge1_sent_at
     or new.nudge2_sent_at is distinct from old.nudge2_sent_at then
    raise exception 'activation nudge timestamps are server-managed' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_activation_nudge_columns_trg on public.profiles;
create trigger protect_activation_nudge_columns_trg
  before update on public.profiles
  for each row execute function public.protect_activation_nudge_columns();

-- Atomically re-check every eligibility condition and claim one delivery.
-- Stamping before the provider call gives strict at-most-once delivery even if
-- a runner crashes. A claimed provider failure is intentionally not retried.
create or replace function public.claim_activation_nudge(p_user_id uuid, p_nudge smallint)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed_count integer;
begin
  if p_nudge not in (1, 2) then
    raise exception 'p_nudge must be 1 or 2';
  end if;

  update public.profiles p
  set nudge1_sent_at = case when p_nudge = 1 then now() else p.nudge1_sent_at end,
      nudge2_sent_at = case when p_nudge = 2 then now() else p.nudge2_sent_at end
  where p.id = p_user_id
    and p.email_tips
    and lower(coalesce(p.username, '')) not in ('test_tony', 'test_tony_depaul')
    and p.created_at >= (
      select s.shipped_at from public.activation_nudge_settings s where s.singleton
    )
    and p.created_at <= now() - case when p_nudge = 1 then interval '24 hours' else interval '72 hours' end
    and (p_nudge <> 1 or (p.nudge1_sent_at is null and p.created_at > now() - interval '72 hours'))
    and (p_nudge <> 2 or p.nudge2_sent_at is null)
    and not exists (
      select 1 from public.user_collections uc
      where uc.user_id = p.id and uc.status in ('owned', 'for_sale')
    );

  get diagnostics claimed_count = row_count;
  return claimed_count = 1;
end;
$$;

revoke all on function public.claim_activation_nudge(uuid, smallint) from public, anon, authenticated;
grant execute on function public.claim_activation_nudge(uuid, smallint) to service_role;

commit;

-- Rollback:
-- drop function if exists public.claim_activation_nudge(uuid, smallint);
-- drop trigger if exists protect_activation_nudge_columns_trg on public.profiles;
-- drop function if exists public.protect_activation_nudge_columns();
-- drop table if exists public.activation_nudge_settings;
-- alter table public.profiles drop column if exists nudge2_sent_at,
--   drop column if exists nudge1_sent_at, drop column if exists email_tips;
