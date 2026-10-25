-- Live sellers: a seller onboarded in test mode before go-live (0089) keeps
-- a test Stripe account that can't take live payments, and the onboarding
-- route only created an account when none existed while this function
-- refused any account change. Allow exactly one kind of change: to an
-- account in the other Stripe mode. Within a mode the account stays locked.
-- (Found 2026-10-24: tanktop__'s payouts page said "ready" on the test account.)

begin;

create or replace function public.mkt_upsert_seller_account(p_user uuid, p_stripe_account_id text, p_livemode boolean, p_charges boolean, p_payouts boolean, p_details boolean, p_requirements jsonb)
returns public.seller_accounts language plpgsql security definer set search_path = public as $$
declare old_row public.seller_accounts%rowtype; result public.seller_accounts%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'service role required' using errcode='42501'; end if;
  select * into old_row from public.seller_accounts where user_id=p_user for update;
  -- The account is locked within a Stripe mode. Moving from test to live
  -- (go-live, 0089) is the one allowed change: the test account can't take
  -- live payments, so the seller onboards a new live account.
  if found and old_row.stripe_account_id is not null and old_row.stripe_account_id is distinct from p_stripe_account_id
    and old_row.livemode is not distinct from p_livemode then
    raise exception 'stripe account cannot be changed' using errcode='55000';
  end if;
  insert into public.seller_accounts(user_id,stripe_account_id,livemode,charges_enabled,payouts_enabled,details_submitted,requirements_due)
  values(p_user,p_stripe_account_id,p_livemode,p_charges,p_payouts,p_details,coalesce(p_requirements,'[]'::jsonb))
  on conflict(user_id) do update set stripe_account_id=case when seller_accounts.livemode is distinct from excluded.livemode then excluded.stripe_account_id else coalesce(seller_accounts.stripe_account_id,excluded.stripe_account_id) end, livemode=excluded.livemode,
    charges_enabled=excluded.charges_enabled,payouts_enabled=excluded.payouts_enabled,details_submitted=excluded.details_submitted,
    requirements_due=excluded.requirements_due,updated_at=now() returning * into result;
  if not found or old_row.user_id is null or (to_jsonb(old_row) - 'updated_at' - 'created_at') is distinct from (to_jsonb(result) - 'updated_at' - 'created_at') then
    insert into public.marketplace_audit_log(actor_role,entity,entity_id,action,before,after)
      values('system','seller',p_user,'seller_account_updated',case when old_row.user_id is null then null else to_jsonb(old_row) end,to_jsonb(result));
  end if;
  return result;
end $$;

commit;

-- Rollback: re-run mkt_upsert_seller_account from 0068_seller_accounts.sql.
