import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/authServer";
import { getMarketplaceStripe } from "@/lib/marketplaceStripe";
import { notifyAdmin } from "@/lib/marketplaceNotify";
import { afterOrderTransition } from "@/lib/orderEvents";
import { refundOrder } from "@/lib/orderRefunds";
import { orderError, partyOrder } from "@/lib/orderRoute";
import { getServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function POST(req, { params }) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const db = getServiceClient();
  try {
    const order = await partyOrder(db, id, user.id);
    if (!order || order.seller_id !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (order.status !== "paid") {
      return NextResponse.json({ error: "Only a paid order can be cancelled and refunded." }, { status: 409 });
    }
    const updated = await refundOrder({
      db,
      stripe: getMarketplaceStripe(),
      order,
      amountCents: order.total_cents - order.refunded_cents,
      reason: "Seller cancelled order",
      actorId: user.id,
      actorRole: "seller",
      notifyAdmin,
    });
    await afterOrderTransition(db, updated, "refunded");
    return NextResponse.json({ status: updated.status });
  } catch (error) {
    console.error("POST order cancellation failed:", error);
    if (error?.code === "REFUND_PERSISTENCE_FAILED") {
      return NextResponse.json({ error: "The refund was sent, but the order needs support review." }, { status: 502 });
    }
    return orderError(error, "Could not refund order.");
  }
}
