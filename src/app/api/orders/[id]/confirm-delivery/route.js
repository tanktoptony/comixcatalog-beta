import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/authServer";
import { afterOrderTransition } from "@/lib/orderEvents";
import { orderError, partyOrder, transitionOrder } from "@/lib/orderRoute";
import { getServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function POST(req, { params }) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const db = getServiceClient();
  try {
    const order = await partyOrder(db, id, user.id);
    if (!order || order.buyer_id !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const updated = await transitionOrder(db, order, "delivered", user.id, "buyer");
    await afterOrderTransition(db, updated, "delivered");
    return NextResponse.json({ status: updated.status });
  } catch (error) {
    console.error("POST order delivery failed:", error);
    return orderError(error);
  }
}
