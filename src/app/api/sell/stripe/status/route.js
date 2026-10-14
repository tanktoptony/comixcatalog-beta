import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/authServer";
import { canUseCheckout } from "@/lib/marketplaceFlags";
import { getServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function GET(req) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canUseCheckout(user.id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { data, error } = await getServiceClient().from("seller_accounts").select("charges_enabled,payouts_enabled,details_submitted,requirements_due,tier,payouts_frozen,completed_orders").eq("user_id", user.id).maybeSingle();
  if (error) return NextResponse.json({ error: "Could not load payout setup" }, { status: 500 });
  return NextResponse.json({ seller: data });
}
