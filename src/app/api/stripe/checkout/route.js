import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getStripe, PRO_PRICE_ID, FOUNDING_PRICE_ID, getSiteUrl } from "@/lib/stripe";
import { ADMIN_ID } from "@/lib/admin";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const { user_id, tier = "pro" } = body;

    if (!user_id) {
      return NextResponse.json({ error: "user_id required" }, { status: 400 });
    }

    const priceId = tier === "founding" ? FOUNDING_PRICE_ID : PRO_PRICE_ID;
    if (!priceId) {
      return NextResponse.json(
        { error: `${tier} tier not configured` },
        { status: 500 }
      );
    }

    const supabase = getSupabase();

    const { data: profile, error: profErr } = await supabase
      .from("profiles")
      .select("id, username, stripe_customer_id, is_pro")
      .eq("id", user_id)
      .single();

    if (profErr || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    if (profile.is_pro || user_id === ADMIN_ID) {
      return NextResponse.json({ error: "Already Pro" }, { status: 400 });
    }

    const { data: authUser } = await supabase.auth.admin.getUserById(user_id);
    const email = authUser?.user?.email ?? null;

    const stripe = getStripe();
    let customerId = profile.stripe_customer_id;

    if (customerId) {
      try {
        const existing = await stripe.customers.retrieve(customerId);
        if (existing.deleted) customerId = null;
      } catch (e) {
        if (e?.code === "resource_missing") customerId = null;
        else throw e;
      }
    }

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: email ?? undefined,
        metadata: { supabase_user_id: user_id },
      });
      customerId = customer.id;

      await supabase
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", user_id);
    }

    const site = getSiteUrl();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${site}/library?upgrade=success`,
      cancel_url: `${site}/upgrade?upgrade=cancelled`,
      allow_promotion_codes: true,
      subscription_data: {
        metadata: { supabase_user_id: user_id, tier },
      },
      metadata: { supabase_user_id: user_id, tier },
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("stripe checkout error:", err);
    return NextResponse.json(
      { error: "Checkout session failed" },
      { status: 500 }
    );
  }
}
