import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/authServer";
import { canUseCheckout } from "@/lib/marketplaceFlags";
import { getServiceClient } from "@/lib/supabase/service";
import { getMarketplaceStripe, MARKETPLACE_LIVEMODE } from "@/lib/marketplaceStripe";
import { orderTotals } from "@/lib/orderRows";
import { getSiteUrl } from "@/lib/stripe";
import { buildCheckoutSessionParams } from "@/lib/checkoutSession";
import { afterOrderTransition } from "@/lib/orderEvents";
import { buyerLimitMessage } from "@/lib/buyerLimits";

export const runtime = "nodejs";

const LIST_FIELDS = "id,buyer_id,seller_id,series_title,issue_number,cover_path,condition,grade_numeric,slab_company,total_cents,seller_net_cents,currency,status,livemode,created_at,paid_at,shipped_at,delivered_at,completed_at,cancelled_at,refunded_at,transferred_at,tracking_carrier,tracking_number,order_items(listing_id,series_title,issue_number,cover_path,condition,grade_numeric,slab_company,item_cents)";

const FEEDBACK_WINDOW_MS = 60 * 86400000;

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
  const ids = (data || []).map((order) => order.id);
  const people = [...new Set((data || []).flatMap((order) => [order.seller_id, order.buyer_id]))];
  const [{ data: profiles }, { data: feedback }, { data: disputes }, { data: refunds }, totalsResult] = await Promise.all([
    people.length ? db.from("profiles").select("id,username").in("id", people) : { data: [] },
    ids.length ? db.from("order_feedback").select("order_id").in("order_id", ids).eq("author_id", user.id) : { data: [] },
    ids.length ? db.from("order_disputes").select("order_id").in("order_id", ids).eq("status", "open") : { data: [] },
    ids.length ? db.from("order_refunds").select("order_id,amount_cents").in("order_id", ids).eq("status", "succeeded") : { data: [] },
    // The strip above the list counts every order, so only the first page asks.
    before ? { data: null } : db.from("orders").select("status,livemode,transferred_at,seller_net_cents").eq(role === "buying" ? "buyer_id" : "seller_id", user.id).limit(1000),
  ]);
  const names = Object.fromEntries((profiles || []).map((profile) => [profile.id, profile.username]));
  const rated = new Set((feedback || []).map((row) => row.order_id));
  const disputed = new Set((disputes || []).map((row) => row.order_id));
  const refunded = {};
  for (const row of refunds || []) refunded[row.order_id] = (refunded[row.order_id] || 0) + row.amount_cents;
  const totals = totalsResult.data
    ? orderTotals(totalsResult.data.map((row) => ({ ...row, test: row.livemode !== MARKETPLACE_LIVEMODE })), role)
    : null;
  const orders = (data || []).map((order) => ({
    ...order,
    test: order.livemode !== MARKETPLACE_LIVEMODE,
    seller_username: names[order.seller_id] || "collector",
    buyer_username: names[order.buyer_id] || "collector",
    open_dispute: disputed.has(order.id),
    refunded_cents: refunded[order.id] || 0,
    needs_feedback: order.status === "completed" && !rated.has(order.id)
      && Date.now() - new Date(order.completed_at).getTime() <= FEEDBACK_WINDOW_MS,
    items: (order.order_items || []).map((item) => ({ ...item, cover_url: item.cover_path && (/^https?:\/\//i.test(item.cover_path) ? item.cover_path : `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/canonical-covers/${item.cover_path}`) })),
    cover_url: order.cover_path && (/^https?:\/\//i.test(order.cover_path)
      ? order.cover_path
      : `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/canonical-covers/${order.cover_path}`),
  }));
  return NextResponse.json({ orders, totals });
}

export async function POST(req) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canUseCheckout(user.id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const listings = Array.isArray(body?.listing_ids) ? body.listing_ids : [body?.listing_id];
  if (listings.length < 1 || listings.length > 20 || new Set(listings).size !== listings.length || listings.some((id) => !UUID.test(id || ""))) {
    return NextResponse.json({ error: "Invalid listing" }, { status: 400 });
  }
  const db = getServiceClient();
  const { data: order, error } = await db.rpc("order_create_multi", {
    p_buyer: user.id,
    p_listings: listings,
    p_request_id: randomUUID(),
  });
  if (error) {
    const [status, message] = mapped(error);
    return NextResponse.json({ error: message }, { status });
  }

  try {
    const { data: items, error: itemsError } = await db.from("order_items").select("*").eq("order_id", order.id);
    if (itemsError) throw itemsError;
    order.items = items;
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
