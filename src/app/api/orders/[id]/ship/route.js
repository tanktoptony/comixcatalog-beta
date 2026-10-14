import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/authServer";
import { afterOrderTransition } from "@/lib/orderEvents";
import { orderError, partyOrder, transitionOrder } from "@/lib/orderRoute";
import { getServiceClient } from "@/lib/supabase/service";
import { validateTracking } from "@/lib/tracking";

export const runtime = "nodejs";

export async function POST(req, { params }) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const db = getServiceClient();
  try {
    const order = await partyOrder(db, id, user.id);
    if (!order || order.seller_id !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const tracking = validateTracking(body || {}, order.total_cents);
    if (!tracking.ok) return NextResponse.json({ error: tracking.error }, { status: 400 });
    const updated = await transitionOrder(db, order, "shipped", user.id, "seller", {
      tracking_carrier: tracking.carrier,
      tracking_number: tracking.trackingNumber,
    });
    await afterOrderTransition(db, updated, "shipped");
    return NextResponse.json({ status: updated.status });
  } catch (error) {
    console.error("POST order ship failed:", error);
    return orderError(error);
  }
}
