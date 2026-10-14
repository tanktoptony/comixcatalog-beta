import { NextResponse } from "next/server";

export function orderError(error, fallback = "Could not update order.") {
  if (error?.code === "55000" || error?.code === "55006") {
    return NextResponse.json({ error: "The order changed. Refresh and try again." }, { status: 409 });
  }
  if (error?.code === "22023") {
    return NextResponse.json({ error: error.message || "Invalid order update." }, { status: 400 });
  }
  if (error?.code === "42501" || error?.code === "P0002") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ error: fallback }, { status: 500 });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function partyOrder(db, id, userId) {
  if (!UUID.test(String(id || ""))) return null;
  const { data, error } = await db
    .from("orders")
    .select("*")
    .eq("id", id)
    .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function transitionOrder(db, order, to, userId, role, payload = {}) {
  const { data, error } = await db.rpc("order_transition", {
    p_order: order.id,
    p_to: to,
    p_actor_id: userId,
    p_actor_role: role,
    p_payload: payload,
    p_request_id: null,
    p_stripe_event_id: null,
  });
  if (error) throw error;
  return data;
}
