import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/service";
import {
  getStripe,
  FOUNDING_PRICE_ID,
  PRO_PRICE_ID,
  PLUS_MONTHLY_PRICE_ID,
  PLUS_ANNUAL_PRICE_ID,
} from "@/lib/stripe";
import { subscriptionEventProfileUpdate } from "@/lib/stripeMembership";

export const runtime = "nodejs";

async function updateProfileByCustomer(supabase, customerId, update) {
  if (!customerId || !update) return;
  await supabase
    .from("profiles")
    .update(update)
    .eq("stripe_customer_id", customerId);
}

function profileUpdateForSubscription(eventType, sub) {
  return subscriptionEventProfileUpdate(eventType, sub, {
    plusMonthlyPriceId: PLUS_MONTHLY_PRICE_ID,
    plusAnnualPriceId: PLUS_ANNUAL_PRICE_ID,
    proPriceId: PRO_PRICE_ID,
    foundingPriceId: FOUNDING_PRICE_ID,
  });
}

export async function POST(req) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("STRIPE_WEBHOOK_SECRET not set");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const rawBody = await req.text();

  let event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (err) {
    console.error("webhook signature verification failed:", err.message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const supabase = getServiceClient();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const userId = session.metadata?.supabase_user_id;
        const customerId = session.customer;
        const tier = session.metadata?.tier;
        if (userId && customerId) {
          const update = { stripe_customer_id: customerId };
          if (tier === "plus") update.membership_tier = "collector_plus";
          if (tier === "pro" || tier === "founding") update.is_pro = true;
          if (tier === "founding") update.is_founding_collector = true;
          await supabase.from("profiles").update(update).eq("id", userId);
        } else if (customerId) {
          const update = tier === "plus"
            ? { membership_tier: "collector_plus" }
            : tier === "founding"
              ? { is_pro: true, is_founding_collector: true }
              : tier === "pro"
                ? { is_pro: true }
                : null;
          await updateProfileByCustomer(supabase, customerId, update);
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object;
        const customerId = sub.customer;
        await updateProfileByCustomer(supabase, customerId, profileUpdateForSubscription(event.type, sub));
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object;
        await updateProfileByCustomer(supabase, sub.customer, profileUpdateForSubscription(event.type, sub));
        break;
      }

      default:
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("webhook handler error:", err);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }
}
