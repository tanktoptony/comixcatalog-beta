import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/authServer";
import { canUseCheckout } from "@/lib/marketplaceFlags";
import { getServiceClient } from "@/lib/supabase/service";

export async function GET(req) {
  const user = await getAuthedUser(req);
  if (!user || !canUseCheckout(user.id)) {
    return NextResponse.json({ canBuy: false });
  }
  const id = new URL(req.url).searchParams.get("listing");
  const db = getServiceClient();
  const { data: listing } = await db
    .from("listings")
    .select("seller_id")
    .eq("id", id)
    .maybeSingle();
  if (!listing || listing.seller_id === user.id) {
    return NextResponse.json({ canBuy: false });
  }
  const { data, error } = await db.rpc("mkt_listing_checkout_block", { p_listing: id });
  return NextResponse.json({ canBuy: !error && data == null });
}
