import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/authServer";
import { canUseCheckout } from "@/lib/marketplaceFlags";

export const runtime = "nodejs";

export async function GET(req) {
  const user = await getAuthedUser(req);
  if (!user || !canUseCheckout(user.id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ allowed: true });
}
