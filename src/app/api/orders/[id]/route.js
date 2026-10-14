import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/authServer";
import { getServiceClient } from "@/lib/supabase/service";
import { canTransition } from "@/lib/orders";

export const runtime = "nodejs";

const ORDER_FIELDS = [
  "id", "listing_id", "buyer_id", "seller_id", "series_title", "issue_number",
  "cover_path", "condition", "grade_numeric", "slab_company", "slab_cert_number",
  "variant_label", "printing_name", "item_cents", "platform_fee_cents",
  "processing_fee_cents", "seller_net_cents",
  "shipping_cents", "tax_cents", "total_cents", "currency", "status", "created_at",
  "paid_at", "shipped_at", "delivered_at", "completed_at", "cancelled_at", "refunded_at",
  "tracking_carrier", "tracking_number", "ship_to", "ship_to_redacted_at",
].join(",");

export async function GET(req, { params }) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const db = getServiceClient();
  const { data, error } = await db
    .from("orders")
    .select(ORDER_FIELDS)
    .eq("id", id)
    .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Could not load order" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const role = data.buyer_id === user.id ? "buyer" : "seller";
  const { data: profiles, error: profilesError } = await db
    .from("profiles")
    .select("id,username")
    .in("id", [data.buyer_id, data.seller_id]);
  if (profilesError) return NextResponse.json({ error: "Could not load order" }, { status: 500 });
  const usernames = Object.fromEntries((profiles || []).map((profile) => [profile.id, profile.username]));
  const actions = {
    mark_shipped: canTransition(data.status, "shipped", role),
    confirm_delivery: canTransition(data.status, "delivered", role),
    cancel_refund: data.status === "paid" && role === "seller",
    open_dispute: role === "buyer" && ["shipped", "delivered"].includes(data.status),
  };
  const timeline = [
    ["created", data.created_at],
    ["paid", data.paid_at],
    ["shipped", data.shipped_at],
    ["delivered", data.delivered_at],
    ["completed", data.completed_at],
    ["cancelled", data.cancelled_at],
    ["refunded", data.refunded_at],
  ].filter((entry) => entry[1]).map(([status, at]) => ({ status, at }));
  const shipTo = role === "seller"
    && ["paid", "shipped", "delivered", "completed", "refunded", "disputed"].includes(data.status)
    && !data.ship_to_redacted_at
      ? data.ship_to
      : null;
  const coverUrl = data.cover_path && (
    /^https?:\/\//i.test(data.cover_path)
      ? data.cover_path
      : `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/canonical-covers/${data.cover_path}`
  );
  delete data.ship_to;
  return NextResponse.json({ order: {
    ...data,
    role,
    actions,
    timeline,
    tracking: { carrier: data.tracking_carrier, number: data.tracking_number },
    ship_to: shipTo,
    buyer_username: usernames[data.buyer_id] || "collector",
    seller_username: usernames[data.seller_id] || "collector",
    cover_url: coverUrl || null,
  } });
}
