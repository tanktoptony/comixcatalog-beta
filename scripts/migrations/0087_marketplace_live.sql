-- Go live (2026-10-24, Tony's OK): marketplace checkout runs on live Stripe
-- keys. New orders and seller onboarding are stamped livemode = true; sellers
-- onboarded in test mode must set up payouts again (their test accounts no
-- longer count as onboarded).
--
-- Also: a refund issued from the Stripe dashboard on a paid, not yet shipped
-- order arrives as charge.refunded with actor 'stripe', and paid -> refunded
-- was only allowed for the seller and admin, so the webhook failed and
-- retried forever (found closing the test order 96a89b7e).

begin;

create or replace function public.mkt_checkout_livemode() returns boolean
language sql immutable as $$ select true $$;
comment on function public.mkt_checkout_livemode() is 'Marketplace checkout mode. Live since 0087 (2026-10-24).';

do $$
declare body text; patched text;
begin
  select prosrc into body from pg_proc
  where oid = 'public.order_transition(uuid,text,uuid,text,jsonb,text,text)'::regprocedure;
  if body like '%(''paid'',''refunded'',''stripe'')%' then return; end if;
  patched := replace(body, $old$('paid','refunded','seller'),$old$, $new$('paid','refunded','seller'), ('paid','refunded','stripe'),$new$);
  if patched = body then raise exception 'order_transition: paid -> refunded rule not found'; end if;
  execute 'create or replace function public.order_transition(p_order uuid,p_to text,p_actor_id uuid,p_actor_role text,p_payload jsonb default ''{}''::jsonb,p_request_id text default null,p_stripe_event_id text default null) returns public.orders language plpgsql security definer set search_path=public as ' || quote_literal(patched);
end $$;

commit;

-- Rollback:
-- create or replace function public.mkt_checkout_livemode() returns boolean language sql immutable as $$ select false $$;
-- (the paid -> refunded rule for 'stripe' can stay; it is correct in both modes)
