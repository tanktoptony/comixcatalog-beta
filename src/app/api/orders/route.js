import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/authServer";
import { canUseCheckout } from "@/lib/marketplaceFlags";
import { getServiceClient } from "@/lib/supabase/service";
import { getMarketplaceStripe } from "@/lib/marketplaceStripe";
import { getSiteUrl } from "@/lib/stripe";
import { buildCheckoutSessionParams } from "@/lib/checkoutSession";
import { afterOrderTransition } from "@/lib/orderEvents";
import { buyerLimitMessage } from "@/lib/buyerLimits";

export const runtime = "nodejs";

const LIST_FIELDS = "id,buyer_id,seller_id,series_title,issue_number,cover_path,condition,grade_numeric,slab_company,total_cents,seller_net_cents,currency,status,created_at,paid_at";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function mapped(error) {
  const code = error?.code;
  const limitMessage = buyerLimitMessage(error);
  if (limitMessage) return [429, limitMessage];
  if (code === "55006") {
    return [
      409,
      String(error.message).includes("listing is unavailable")
        ? "Someone else is checking out this book right now"
        : "This book can't be bought through checkout yet",
    ];
  }
  if (code === "42501") return [403, "You can't buy this book"];
  if (code === "P0002") return [404, "Listing not found"];
  if (code === "22023") return [400, "Invalid listing"];
  return [500, "Could not start checkout"];
}

export async function GET(req) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canUseCheckout(user.id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const url = new URL(req.url);
  const role = url.searchParams.get("role");
  const before = url.searchParams.get("before");
  if (role !== "buying" && role !== "selling") {
    return NextResponse.json({ error: "Role must be buying or selling." }, { status: 400 });
  }
  if (before && Number.isNaN(Date.parse(before))) {
    return NextResponse.json({ error: "Invalid before date." }, { status: 400 });
  }
  const db = getServiceClient();
  let query = db
    .from("orders")
    .select(LIST_FIELDS)
    .eq(role === "buying" ? "buyer_id" : "seller_id", user.id)
    .order("created_at", { ascending: false })
    .limit(25);
  if (before) query = query.lt("created_at", before);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "Could not load orders." }, { status: 500 });
  const orders = (data || []).map((order) => ({
    ...order,
    cover_url: order.cover_path && (/^https?:\/\//i.test(order.cover_path)
      ? order.cover_path
      : `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/canonical-covers/${order.cover_path}`),
  }));
  return NextResponse.json({ orders });
}

export async function POST(req) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canUseCheckout(user.id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const listing = body?.listing_id;
  if (!UUID.test(listing || "")) {
    return NextResponse.json({ error: "Invalid listing" }, { status: 400 });
  }
  const db = getServiceClient();
  const { data: order, error } = await db.rpc("order_create", {
    p_buyer: user.id,
    p_listing: listing,
    p_request_id: randomUUID(),
  });
  if (error) {
    const [status, message] = mapped(error);
    return NextResponse.json({ error: message }, { status });
  }

  try {
    const stripe = getMarketplaceStripe();
    const session = await stripe.checkout.sessions.create(
      buildCheckoutSessionParams(order, { siteUrl: getSiteUrl() }),
      { idempotencyKey: `order-session-${order.id}` },
    );
    const { error: transitionError } = await db.rpc("order_transition", {
      p_order: order.id,
      p_to: "awaiting_payment",
      p_actor_id: null,
      p_actor_role: "system",
      p_payload: { stripe_checkout_session_id: session.id },
      p_request_id: null,
      p_stripe_event_id: null,
    });
    if (transitionError) throw transitionError;
    return NextResponse.json({ url: session.url });
  } catch (checkoutError) {
    const cancelled = await db.rpc("order_transition", {
      p_order: order.id,
      p_to: "cancelled",
      p_actor_id: null,
      p_actor_role: "system",
      p_payload: {},
      p_request_id: null,
      p_stripe_event_id: null,
    });
    if (cancelled.error) {
      console.error("marketplace checkout cancellation failed:", cancelled.error);
    } else if (cancelled.data) {
      await afterOrderTransition(db, cancelled.data, "cancelled");
    }
    console.error("marketplace checkout failed:", checkoutError);
    return NextResponse.json({ error: "Checkout is unavailable right now" }, { status: 502 });
  }
}
