import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { getMarketplaceStripe } from "@/lib/marketplaceStripe";
import { notifyAdmin } from "@/lib/marketplaceNotify";
import { refundOrder } from "@/lib/orderRefunds";
import { getServiceClient } from "@/lib/supabase/service";

export async function POST(req, { params }) {
  const auth = await requireAdmin(req);
  if (auth.response) return auth.response;
  const body = await req.json().catch((error) => {
    console.error("Admin refund JSON failed:", error);
    return null;
  });
  if (!body || !Number.isInteger(body.amount_cents) || body.amount_cents < 1 || String(body.reason || "").trim().length < 3) return NextResponse.json({ error: "A positive amount and reason are required." }, { status: 400 });
  const { id } = await params;
  const db = getServiceClient();
  const { data: order, error } = await db.from("orders").select("*").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: "Could not load order." }, { status: 500 });
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const updated = await refundOrder({ db, stripe: getMarketplaceStripe(), order, amountCents: body.amount_cents, reason: body.reason, actorId: auth.admin.id, actorRole: "admin", notifyAdmin });
    return NextResponse.json({ order: updated });
  } catch (refundError) {
    console.error("Admin refund failed:", refundError);
    return NextResponse.json({ error: refundError.message || "Could not refund order." }, { status: refundError instanceof RangeError || refundError instanceof TypeError ? 400 : 502 });
  }
}
