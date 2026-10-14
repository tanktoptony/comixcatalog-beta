import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { getServiceClient } from "@/lib/supabase/service";

export async function GET(req, { params }) {
  const auth = await requireAdmin(req);
  if (auth.response) return auth.response;
  const { id } = await params;
  const db = getServiceClient();
  const { data: order, error } = await db.from("orders").select("*").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: "Could not load order." }, { status: 500 });
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const results = await Promise.all([
    db.from("order_disputes").select("*").eq("order_id", id).order("opened_at"),
    db.from("order_refunds").select("*").eq("order_id", id).order("created_at"),
    db.from("messages").select("*").eq("order_id", id).order("created_at"),
    db.from("marketplace_audit_log").select("*").eq("entity_id", id).order("at"),
    db.from("profiles").select("id,username").in("id", [order.buyer_id, order.seller_id]),
    db.from("seller_accounts").select("user_id,tier,payouts_frozen,tier_reason").eq("user_id", order.seller_id).maybeSingle(),
  ]);
  const failed = results.find((result) => result.error);
  if (failed) return NextResponse.json({ error: "Could not load complete order history." }, { status: 500 });
  const mode = order.livemode ? "" : "test/";
  return NextResponse.json({ order: {
    ...order,
    stripe_links: {
      payment: order.stripe_payment_intent_id ? `https://dashboard.stripe.com/${mode}payments/${order.stripe_payment_intent_id}` : null,
      charge: order.stripe_charge_id ? `https://dashboard.stripe.com/${mode}payments/${order.stripe_charge_id}` : null,
      transfer: order.stripe_transfer_id ? `https://dashboard.stripe.com/${mode}connect/transfers/${order.stripe_transfer_id}` : null,
    },
    disputes: results[0].data || [], refunds: results[1].data || [], messages: results[2].data || [], audit: results[3].data || [], profiles: results[4].data || [], seller_account: results[5].data,
  } });
}
