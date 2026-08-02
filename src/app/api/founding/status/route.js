import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthedUser } from "@/lib/authServer";

const CAP = 100;
const RESERVED_BASELINE = 17;
const LEGACY_DONORS = 2;
const REQUIRED_BOOKS = 10;

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

async function getAvailability(supabase) {
  const { count, error } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("is_founding_collector", true);
  if (error) throw error;
  const campaignClaims = Math.max(0, (Number(count) || 0) - LEGACY_DONORS);
  const claimed = RESERVED_BASELINE + campaignClaims;
  return { cap: CAP, claimed, remaining: Math.max(0, 83 - campaignClaims) };
}

export async function GET(req) {
  try {
    const supabase = getSupabase();
    const availability = await getAvailability(supabase);
    const user = await getAuthedUser(req);
    let eligibleBooks = 0;
    let isFounding = false;

    if (user) {
      const [{ count }, { data: profile }] = await Promise.all([
        supabase
          .from("user_collections")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id),
        supabase
          .from("profiles")
          .select("is_founding_collector")
          .eq("id", user.id)
          .single(),
      ]);
      eligibleBooks = Number(count) || 0;
      isFounding = Boolean(profile?.is_founding_collector);
    }

    return NextResponse.json({
      ...availability,
      requiredBooks: REQUIRED_BOOKS,
      eligibleBooks,
      isFounding,
      canClaim: Boolean(user) && !isFounding && eligibleBooks >= REQUIRED_BOOKS && availability.remaining > 0,
    });
  } catch (error) {
    console.error("founding status failed:", error);
    return NextResponse.json({ error: "Could not load founding availability" }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ error: "Sign in to claim a pass" }, { status: 401 });
    const supabase = getSupabase();
    const availability = await getAvailability(supabase);
    if (availability.remaining < 1) return NextResponse.json({ error: "All founding passes have been claimed" }, { status: 409 });
    const { count, error: countError } = await supabase.from("user_collections").select("id", { count: "exact", head: true }).eq("user_id", user.id);
    if (countError) throw countError;
    if ((Number(count) || 0) < REQUIRED_BOOKS) return NextResponse.json({ error: `Catalog ${REQUIRED_BOOKS} comics before claiming your pass` }, { status: 400 });
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
