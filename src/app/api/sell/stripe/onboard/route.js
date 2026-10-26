import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/authServer";
import { canUseCheckout } from "@/lib/marketplaceFlags";
import { getMarketplaceStripe, MARKETPLACE_LIVEMODE } from "@/lib/marketplaceStripe";
import { getServiceClient } from "@/lib/supabase/service";
import { getSiteUrl } from "@/lib/stripe";

export const runtime = "nodejs";

export async function POST(req) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canUseCheckout(user.id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const supabase = getServiceClient();
  const { data: existing, error } = await supabase.from("seller_accounts").select("stripe_account_id,livemode").eq("user_id", user.id).maybeSingle();
  if (error) return NextResponse.json({ error: "Could not load payout setup" }, { status: 500 });
  try {
    const stripe = getMarketplaceStripe();
    // An account from the other Stripe mode (test-mode onboarding before go-live)
    // can't be used: start a new one in this mode.
    let account = existing?.livemode === MARKETPLACE_LIVEMODE ? existing.stripe_account_id : null;
    if (!account) {
      // The key dedupes double clicks, but only within 10 minutes: Stripe replays
      // a failed response for the same key for 24 hours, so a fixed key kept
      // returning a rejection after the seller had cleared it on Stripe's side.
      const created = await stripe.accounts.create({ type: "express", country: "US", email: user.email, capabilities: { transfers: { requested: true } }, business_profile: { product_description: "Comic books sold on ComixCatalog" }, metadata: { supabase_user_id: user.id } }, { idempotencyKey: `acct-${MARKETPLACE_LIVEMODE ? "live" : "test"}-${user.id}-${Math.floor(Date.now() / 600000)}` });
      account = created.id;
      const { error: upsertError } = await supabase.rpc("mkt_upsert_seller_account", { p_user: user.id, p_stripe_account_id: account, p_livemode: MARKETPLACE_LIVEMODE, p_charges: created.charges_enabled, p_payouts: created.payouts_enabled, p_details: created.details_submitted, p_requirements: created.requirements?.currently_due || [] });
      if (upsertError) throw upsertError;
    }
    const site = getSiteUrl();
    const link = await stripe.accountLinks.create({ account, type: "account_onboarding", refresh_url: `${site}/sell/payouts?refresh=1`, return_url: `${site}/sell/payouts?return=1` });
    return NextResponse.json({ url: link.url });
  } catch (stripeError) {
    console.error("marketplace Stripe onboarding failed:", stripeError);
    return NextResponse.json({ error: "Stripe payout setup is unavailable right now" }, { status: 502 });
  }
}
