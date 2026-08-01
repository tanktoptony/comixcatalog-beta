import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getStripe, getSiteUrl } from "@/lib/stripe";
import { getAuthedUser } from "@/lib/authServer";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export async function POST(req) {
  try {
    const authedUser = await getAuthedUser(req);
    if (!authedUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const user_id = authedUser.id;

    const supabase = getSupabase();

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user_id)
      .single();

    if (error || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }
    if (!profile.stripe_customer_id) {
      return NextResponse.json(
        { error: "No active subscription on file" },
        { status: 400 }
      );
    }

    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${getSiteUrl()}/library`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("stripe portal error:", err);
    return NextResponse.json(
      { error: "Could not open billing portal" },
      { status: 500 }
    );
  }
}
