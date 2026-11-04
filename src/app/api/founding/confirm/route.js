import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/service";
import { hashFoundingToken, isFoundingTokenExpired, mapFoundingClaim } from "@/lib/foundingClaim";
import { SITE_URL } from "@/lib/siteUrl";

const destination = (query) => NextResponse.redirect(`${SITE_URL}/founding-collectors?${query}`, 303);

export async function GET(req) {
  try {
    const token = new URL(req.url).searchParams.get("token");
    if (!token) return destination("claim=invalid");
    const supabase = getServiceClient();
    const { data: row, error: lookupError } = await supabase
      .from("founding_claim_tokens")
      .select("user_id, created_at, confirmed_at")
      .eq("token_hash", hashFoundingToken(token))
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (!row) return destination("claim=invalid");
    // Second click on the same link, or a mail scanner got there first. If the
    // pass went through, this person is a founder: say so rather than telling
    // them the link is dead and to claim again.
    if (row.confirmed_at) {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("is_founding_collector")
        .eq("id", row.user_id)
        .maybeSingle();
      if (profileError) throw profileError;
      return destination(profile?.is_founding_collector ? "claimed=1" : "claim=invalid");
    }
    if (isFoundingTokenExpired(row.created_at)) return destination("claim=expired");

    const { data, error: claimError } = await supabase.rpc("claim_founding_pass", { p_user_id: row.user_id });
    if (claimError) throw claimError;
    const claim = mapFoundingClaim(data);
    const { error: confirmError } = await supabase.from("founding_claim_tokens")
      .update({ confirmed_at: new Date().toISOString() })
      .eq("user_id", row.user_id)
      .eq("token_hash", hashFoundingToken(token))
      .is("confirmed_at", null);
    if (confirmError) throw confirmError;
    return destination(claim.ok ? "claimed=1" : "claim=soldout");
  } catch (error) {
    console.error("founding confirmation failed:", error);
    return NextResponse.json({ error: "Could not confirm founding pass" }, { status: 500 });
  }
}
