import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/authServer";
import { canUseCheckout } from "@/lib/marketplaceFlags";
import { getServiceClient } from "@/lib/supabase/service";
import { MARKETPLACE_LIVEMODE } from "@/lib/marketplaceStripe";

export const runtime = "nodejs";

export async function GET(req) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canUseCheckout(user.id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { data, error } = await getServiceClient().from("seller_accounts").select("livemode,charges_enabled,payouts_enabled,details_submitted,requirements_due,tier,payouts_frozen,completed_orders,additional_item_shipping_cents").eq("user_id", user.id).maybeSingle();
  if (error) return NextResponse.json({ error: "Could not load payout setup" }, { status: 500 });
  // A test-mode Stripe account can't take live payments: show live checkout
  // as not set up until the seller onboards again.
  if (data && data.livemode !== MARKETPLACE_LIVEMODE) return NextResponse.json({ seller: null });
  return NextResponse.json({ seller: data });
}

export async function PATCH(req) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canUseCheckout(user.id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await req.json().catch(() => null);
  const cents = Number(body?.additional_item_shipping_cents);
  if (!Number.isInteger(cents) || cents < 0 || cents > 2000) return NextResponse.json({ error: "Enter an amount from $0 to $20." }, { status: 400 });
  const { data, error } = await getServiceClient().from("seller_accounts").update({ additional_item_shipping_cents: cents }).eq("user_id", user.id).select("additional_item_shipping_cents").single();
  if (error) return NextResponse.json({ error: "Could not save shipping." }, { status: 500 });
  return NextResponse.json({ seller: data });
}
