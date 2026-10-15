import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/authServer";
import { canUseCheckout } from "@/lib/marketplaceFlags";
import { getMarketplaceStripe, MARKETPLACE_LIVEMODE } from "@/lib/marketplaceStripe";
import { getServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function POST(req) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canUseCheckout(user.id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const supabase = getServiceClient();
  const { data: seller, error } = await supabase.from("seller_accounts").select("stripe_account_id").eq("user_id", user.id).maybeSingle();
  if (error) return NextResponse.json({ error: "Could not load payout setup" }, { status: 500 });
  if (!seller?.stripe_account_id) return NextResponse.json({ error: "Payout setup has not started" }, { status: 404 });
  try {
    // Stripe Account objects have no livemode field; the mode comes from our key.
    const account = await getMarketplaceStripe().accounts.retrieve(seller.stripe_account_id);
    const { data, error: upsertError } = await supabase.rpc("mkt_upsert_seller_account", { p_user: user.id, p_stripe_account_id: account.id, p_livemode: MARKETPLACE_LIVEMODE, p_charges: account.charges_enabled, p_payouts: account.payouts_enabled, p_details: account.details_submitted, p_requirements: account.requirements?.currently_due || [] });
    if (upsertError) throw upsertError;
    return NextResponse.json({ seller: data });
  } catch (stripeError) {
    console.error("marketplace Stripe account refresh failed:", stripeError);
    return NextResponse.json({ error: "Stripe payout status is unavailable right now" }, { status: 502 });
  }
}
