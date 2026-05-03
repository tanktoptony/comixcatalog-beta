import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getStripe, FOUNDING_PRICE_ID } from "@/lib/stripe";

export const runtime = "nodejs";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

async function setProStatusByCustomer(supabase, customerId, isPro, isFounding = false) {
  if (!customerId) return;
  const update = { is_pro: isPro };
  if (isFounding) update.is_founding_collector = true;
  if (!isPro) update.is_founding_collector = false;
  await supabase
    .from("profiles")
    .update(update)
    .eq("stripe_customer_id", customerId);
}

function isFoundingPrice(sub) {
  if (!FOUNDING_PRICE_ID) return false;
  return (sub.items?.data ?? []).some((item) => item.price?.id === FOUNDING_PRICE_ID);
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

  const supabase = getSupabase();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const userId = session.metadata?.supabase_user_id;
        const customerId = session.customer;
        const isFounding = session.metadata?.tier === "founding";
        if (userId && customerId) {
          const update = { stripe_customer_id: customerId, is_pro: true };
          if (isFounding) update.is_founding_collector = true;
          await supabase.from("profiles").update(update).eq("id", userId);
        } else if (customerId) {
          await setProStatusByCustomer(supabase, customerId, true, isFounding);
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object;
        const customerId = sub.customer;
        const active = ["active", "trialing"].includes(sub.status);
        const isFounding = isFoundingPrice(sub);
        await setProStatusByCustomer(supabase, customerId, active, isFounding);
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object;
        await setProStatusByCustomer(supabase, sub.customer, false);
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
