import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthedUser } from "@/lib/authServer";

const CAP = 100;

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

async function getAvailability(supabase) {
  // Must count actual founding-collector claims, not total signups — a
  // regular (non-founding) signup was previously eating a founding slot in
  // this count, which would eventually show "sold out" based on total users
  // rather than actual claims.
  const { count, error } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("is_founding_collector", true);
  if (error) throw error;
  const claimed = Number(count) || 0;
  return { cap: CAP, claimed, remaining: Math.max(0, CAP - claimed) };
}

export async function GET(req) {
  try {
    const supabase = getSupabase();
    const availability = await getAvailability(supabase);
    const user = await getAuthedUser(req);
    let isFounding = false;

    if (user) {
      const { data: profile } = await supabase
          .from("profiles")
          .select("is_founding_collector")
          .eq("id", user.id)
          .single();
      isFounding = Boolean(profile?.is_founding_collector);
    }

    return NextResponse.json({
      ...availability,
      isFounding,
      canClaim: Boolean(user) && !isFounding && availability.remaining > 0,
    });
  } catch (error) {
    console.error("founding status failed:", error);
    return NextResponse.json({ error: "Could not load founding availability" }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ error: "Sign in to activate your membership" }, { status: 401 });
    const supabase = getSupabase();
    const availability = await getAvailability(supabase);
    if (availability.remaining < 1) return NextResponse.json({ error: "All founding passes have been claimed" }, { status: 409 });
    const { error } = await supabase.from("profiles").update({ is_pro: true, is_founding_collector: true }).eq("id", user.id);
    if (error) {
      return NextResponse.json({ error: error.message || "Could not claim founding pass" }, { status: 500 });
    }
    const next = await getAvailability(supabase);
    return NextResponse.json({ ok: true, ...next });
  } catch (error) {
    console.error("founding claim failed:", error);
    return NextResponse.json({ error: "Could not claim founding pass" }, { status: 500 });
  }
}
