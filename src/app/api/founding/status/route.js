import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/service";
import { getAuthedUser } from "@/lib/authServer";
import { isDisposableEmail } from "@/lib/disposableEmail";
import { buildFoundingClaimEmail, createFoundingToken, hashFoundingToken, mapFoundingClaim } from "@/lib/foundingClaim";
import { resendBatch } from "@/lib/newsletter";
import { SITE_URL } from "@/lib/siteUrl";
import { foundingInboxIsClaimed } from "@/lib/foundingInbox";

const CAP = 100;

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
    const supabase = getServiceClient();
    const availability = await getAvailability(supabase);
    const user = await getAuthedUser(req);
    let isFounding = false;
    let number = null;

    if (user) {
      const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("is_founding_collector, created_at")
          .eq("id", user.id)
          .single();
      if (profileError) throw profileError;
      isFounding = Boolean(profile?.is_founding_collector);
      // Your pass number is your place in join order among founders, the
      // same order the wall on /founding-collectors uses
      // (src/lib/foundingRoster.js), so the card and the wall agree.
      if (isFounding && profile.created_at) {
        const { count, error: countError } = await supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("is_founding_collector", true)
          .lt("created_at", profile.created_at);
        if (countError) throw countError;
        number = (Number(count) || 0) + 1;
      }
    }

    return NextResponse.json({
      ...availability,
      isFounding,
      number,
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
    const supabase = getServiceClient();
    const availability = await getAvailability(supabase);
    if (availability.remaining < 1) return NextResponse.json({ error: "All founding passes have been claimed" }, { status: 409 });
    if (await foundingInboxIsClaimed(supabase, user.id)) {
      return NextResponse.json({ error: "This inbox already holds a founding pass" }, { status: 409 });
    }

    const providers = new Set([
      user.app_metadata?.provider,
      ...(user.identities ?? []).map((identity) => identity.provider),
    ]);
    if (providers.has("google")) {
      const { data, error } = await supabase.rpc("claim_founding_pass", { p_user_id: user.id });
      if (error) throw error;
      const claim = mapFoundingClaim(data);
      if (!claim.ok) return NextResponse.json({ error: "All founding passes have been claimed" }, { status: 409 });
      return NextResponse.json(claim);
    }

    const email = String(user.email || "").trim().toLowerCase();
    if (!email || isDisposableEmail(email)) {
      return NextResponse.json({ error: "Founding passes need a real email address." }, { status: 422 });
    }

    const { data: existing, error: lookupError } = await supabase
      .from("founding_claim_tokens")
      .select("sent_count, last_sent_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (lookupError) throw lookupError;
    const lastSent = existing?.last_sent_at ? new Date(existing.last_sent_at).getTime() : 0;
    if (lastSent && Date.now() - lastSent < 10 * 60 * 1000) {
      return NextResponse.json({ error: "We just sent it. Check your inbox (and spam)." }, { status: 429 });
    }
    if ((existing?.sent_count ?? 0) >= 5) {
      return NextResponse.json({ error: "You have reached the confirmation email limit." }, { status: 429 });
    }

    const token = createFoundingToken();
    const now = new Date().toISOString();
    const { error: tokenError } = await supabase.from("founding_claim_tokens").upsert({
      user_id: user.id,
      token_hash: hashFoundingToken(token),
      email,
      created_at: now,
      sent_count: (existing?.sent_count ?? 0) + 1,
      last_sent_at: now,
      confirmed_at: null,
    }, { onConflict: "user_id" });
    if (tokenError) throw tokenError;

    const confirmUrl = `${SITE_URL}/api/founding/confirm?token=${encodeURIComponent(token)}`;
    try {
      await resendBatch([buildFoundingClaimEmail(email, confirmUrl)]);
    } catch (sendError) {
      // Undo the send bookkeeping so a failed send doesn't lock them out of
      // retrying for ten minutes or count toward the five-send limit.
      const { error: rollbackError } = await supabase.from("founding_claim_tokens")
        .update({ sent_count: existing?.sent_count ?? 0, last_sent_at: existing?.last_sent_at ?? null })
        .eq("user_id", user.id);
      if (rollbackError) console.error("founding claim send rollback failed:", rollbackError);
      throw sendError;
    }
    return NextResponse.json({ ok: true, pending: true, remaining: availability.remaining });
  } catch (error) {
    console.error("founding claim failed:", error);
    return NextResponse.json({ error: "Could not claim founding pass" }, { status: 500 });
  }
}
