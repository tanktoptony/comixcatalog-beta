import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/authServer";
import { canUseCheckout } from "@/lib/marketplaceFlags";
import { getMarketplaceStripe } from "@/lib/marketplaceStripe";
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
    const link = await getMarketplaceStripe().accounts.createLoginLink(seller.stripe_account_id);
    return NextResponse.json({ url: link.url });
  } catch (stripeError) {
    console.error("marketplace Stripe dashboard link failed:", stripeError);
    return NextResponse.json({ error: "Stripe dashboard is unavailable right now" }, { status: 502 });
  }
}
