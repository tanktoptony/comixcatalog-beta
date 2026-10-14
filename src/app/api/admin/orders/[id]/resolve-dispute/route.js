import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { getMarketplaceStripe } from "@/lib/marketplaceStripe";
import { notifyAdmin } from "@/lib/marketplaceNotify";
import { refundOrder } from "@/lib/orderRefunds";
import { getServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req, { params }) {
  const auth = await requireAdmin(req);
  if (auth.response) return auth.response;
  const body = await req.json().catch((error) => {
    console.error("Resolve dispute JSON failed:", error);
    return null;
  });
  const note = String(body?.note || "").trim();
  const outcomeOk = ["buyer", "seller", "withdrawn"].includes(body?.outcome);
  const refundOk = body?.outcome !== "buyer" || (Number.isInteger(body?.refund_cents) && body.refund_cents >= 1);
  if (!outcomeOk || note.length < 3 || !refundOk) {
    return NextResponse.json({ error: "A valid outcome, note, and buyer refund are required." }, { status: 400 });
  }
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const db = getServiceClient();

  let stripeRefundId = null;
  if (body.outcome === "buyer") {
    // Money moves in Stripe first; order_resolve_dispute refuses a buyer win without the refund id.
    const { data: order, error: orderError } = await db.from("orders").select("*").eq("id", id).maybeSingle();
    if (orderError) {
      console.error("Resolve dispute order load failed:", orderError);
      return NextResponse.json({ error: "Could not load order" }, { status: 500 });
    }
    if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (order.status !== "disputed") {
      return NextResponse.json({ error: "This order has no dispute to resolve." }, { status: 409 });
    }
    try {
      const recorded = await refundOrder({
        db,
        stripe: getMarketplaceStripe(),
        order,
        amountCents: body.refund_cents,
        reason: note,
        actorId: auth.admin.id,
        actorRole: "admin",
        notifyAdmin,
      });
      const { data: refundRow, error: refundRowError } = await db
        .from("order_refunds")
        .select("stripe_refund_id")
        .eq("order_id", id)
        .not("stripe_refund_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (refundRowError) throw refundRowError;
      stripeRefundId = refundRow?.stripe_refund_id || null;
      if (!recorded || !stripeRefundId) throw new Error("refund recorded without a Stripe id");
    } catch (error) {
      console.error("Resolve dispute refund failed:", error);
      const status = error instanceof RangeError || error instanceof TypeError ? 400 : 502;
      return NextResponse.json({ error: error.message || "Refund failed" }, { status });
    }
  }

  const { data, error } = await db.rpc("order_resolve_dispute", {
    p_admin: auth.admin.id,
    p_order: id,
    p_outcome: body.outcome,
    p_note: note,
    p_refund_cents: body.outcome === "buyer" ? body.refund_cents : null,
    p_stripe_refund_id: stripeRefundId,
  });
  if (error) {
    if (stripeRefundId) {
      await notifyAdmin(`Refund ${stripeRefundId} went out for order ${id}, but the dispute could not be marked resolved: ${error.message}`);
    }
    return NextResponse.json(
      { error: error.code === "P0002" ? "Not found" : error.message },
      { status: error.code === "P0002" ? 404 : 409 },
    );
  }
  return NextResponse.json({ dispute: data });
}
