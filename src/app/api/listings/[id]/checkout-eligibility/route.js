import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/authServer";
import { canUseCheckout } from "@/lib/marketplaceFlags";
import { sellerBlockMessage } from "@/lib/sellerStanding";
import { getServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function GET(req, { params }) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canUseCheckout(user.id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { id } = await params;
  const supabase = getServiceClient();
  const { data: listing, error } = await supabase.from("listings").select("id,seller_id").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: "Could not load listing" }, { status: 500 });
  if (!listing || listing.seller_id !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { data: block, error: rpcError } = await supabase.rpc("mkt_listing_checkout_block", { p_listing: id });
  if (rpcError) return NextResponse.json({ error: "Could not check this listing" }, { status: 500 });
  return NextResponse.json({ block, message: sellerBlockMessage(block) });
}
