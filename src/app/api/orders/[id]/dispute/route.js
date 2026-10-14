import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/authServer";
import { notifyAdmin } from "@/lib/marketplaceNotify";
import { afterOrderTransition } from "@/lib/orderEvents";
import { getServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function POST(req, { params }) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch((error) => {
    console.error("Dispute request JSON failed:", error);
    return null;
  });
  if (!body || !["not_received", "not_as_described"].includes(body.kind) || String(body.reason || "").trim().length < 10 || String(body.reason).length > 2000) {
    return NextResponse.json({ error: "Choose a reason and add 10 to 2000 characters of detail." }, { status: 400 });
  }
  const db = getServiceClient();
  const { data: dispute, error } = await db.rpc("order_open_dispute", {
    p_order: id,
    p_buyer: user.id,
    p_kind: body.kind,
    p_reason: body.reason.trim(),
  });
  if (error) {
    const status = error.code === "P0002" || error.code === "42501" ? 404 : error.code === "22023" ? 400 : 409;
    return NextResponse.json({ error: error.message || "Could not open dispute." }, { status });
  }
  const { data: order, error: orderError } = await db.from("orders").select("*").eq("id", id).single();
  if (orderError) return NextResponse.json({ error: "Dispute opened, but notifications need support review." }, { status: 502 });
  await afterOrderTransition(db, order, "disputed");
  await notifyAdmin(`Buyer dispute opened for order ${id}: /admin/orders/${id}`);
  return NextResponse.json({ dispute }, { status: 201 });
}
