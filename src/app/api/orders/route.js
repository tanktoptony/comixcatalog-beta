import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/authServer";
import { canUseCheckout } from "@/lib/marketplaceFlags";
import { getServiceClient } from "@/lib/supabase/service";
import { getMarketplaceStripe } from "@/lib/marketplaceStripe";
import { getSiteUrl } from "@/lib/stripe";
import { buildCheckoutSessionParams } from "@/lib/checkoutSession";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function mapped(error) {
  const code = error?.code;
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
  const { count, error: countError } = await db
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("buyer_id", user.id)
    .in("status", ["created", "awaiting_payment"]);
  if (countError) return NextResponse.json({ error: "Could not start checkout" }, { status: 500 });
  if ((count || 0) >= 2) {
    return NextResponse.json({ error: "Finish or cancel an open checkout first" }, { status: 429 });
  }

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
    }
    console.error("marketplace checkout failed:", checkoutError);
    return NextResponse.json({ error: "Checkout is unavailable right now" }, { status: 502 });
  }
}
