import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/authServer";
import { canUseCheckout } from "@/lib/marketplaceFlags";
import { getServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function GET(req) {
  const user = await getAuthedUser(req);
  if (!user || !canUseCheckout(user.id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // Paid orders waiting on this seller to ship: drives the header badge.
  const { count, error } = await getServiceClient()
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("seller_id", user.id)
    .eq("status", "paid");
  if (error) console.error("orders access to_ship count failed:", error.message);
  return NextResponse.json({ allowed: true, to_ship: error ? 0 : count ?? 0 });
}
