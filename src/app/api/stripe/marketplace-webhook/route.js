import { NextResponse } from "next/server";
import { getMarketplaceStripe, MARKETPLACE_LIVEMODE } from "@/lib/marketplaceStripe";
import { getServiceClient } from "@/lib/supabase/service";
import { handleMarketplaceEvent } from "@/lib/marketplaceWebhook";
import { resendBatch } from "@/lib/newsletter";

export const runtime = "nodejs";

async function notifyAdmin(message) {
  const to = process.env.REPORTS_NOTIFY_EMAIL;
  if (!to) {
    console.warn(message);
    return;
  }
  const html = String(message).replace(/[&<>]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
  })[character]);
  await resendBatch([{
    to,
    subject: "Marketplace Stripe alert",
    text: message,
    html: `<p>${html}</p>`,
  }]);
}

export async function POST(req) {
  const platform = process.env.STRIPE_MKT_WEBHOOK_SECRET;
  const connect = process.env.STRIPE_MKT_CONNECT_WEBHOOK_SECRET;
  if (!platform && !connect) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const raw = await req.text();
  const stripe = getMarketplaceStripe();
  let event;
  let signatureError;
  for (const secret of [platform, connect].filter(Boolean)) {
    try {
      event = stripe.webhooks.constructEvent(raw, signature, secret);
      break;
    } catch (error) {
      signatureError = error;
    }
  }
  if (!event) {
    console.error("marketplace webhook signature verification failed:", signatureError?.message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }
  if (event.livemode !== MARKETPLACE_LIVEMODE) {
    return NextResponse.json({ ignored: "mode" });
  }

  const db = getServiceClient();
  try {
    const { data: claim, error } = await db.rpc("mkt_claim_stripe_event", {
      p_id: event.id,
      p_type: event.type,
      p_livemode: event.livemode,
      p_account: event.account || null,
    });
    if (error) throw error;
    if (claim === "done") return NextResponse.json({ received: true });

    await handleMarketplaceEvent(event, { db, stripe, notifyAdmin });
    const { error: finishError } = await db.rpc("mkt_finish_stripe_event", {
      p_id: event.id,
      p_error: null,
    });
    if (finishError) throw finishError;
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("marketplace webhook failed:", error);
    await db.rpc("mkt_finish_stripe_event", {
      p_id: event.id,
      p_error: error?.message || String(error),
    }).catch(() => {});
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }
}
