import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/authServer";
import { getMarketplaceStripe } from "@/lib/marketplaceStripe";
import { notifyAdmin } from "@/lib/marketplaceNotify";
import { afterOrderTransition } from "@/lib/orderEvents";
import { orderError, partyOrder, transitionOrder } from "@/lib/orderRoute";
import { getServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function POST(req, { params }) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const db = getServiceClient();
  let refunded = false;
  try {
    const order = await partyOrder(db, id, user.id);
    if (!order || order.seller_id !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (order.status !== "paid") {
      return NextResponse.json({ error: "Only a paid order can be cancelled and refunded." }, { status: 409 });
    }
    await getMarketplaceStripe().refunds.create(
      { payment_intent: order.stripe_payment_intent_id },
      { idempotencyKey: `refund-seller-cancel-${id}` },
    );
    refunded = true;
    const updated = await transitionOrder(db, order, "refunded", user.id, "seller", {
      amount_cents: order.total_cents,
    });
    await afterOrderTransition(db, updated, "refunded");
    return NextResponse.json({ status: updated.status });
  } catch (error) {
    console.error("POST order cancellation failed:", error);
    if (refunded) {
      await notifyAdmin(`Stripe refunded order ${id}, but its database transition failed: ${error?.message || error}`);
      return NextResponse.json({ error: "The refund was sent, but the order needs support review." }, { status: 502 });
    }
    return orderError(error, "Could not refund order.");
  }
}
