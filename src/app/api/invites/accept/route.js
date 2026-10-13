import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/authServer";
import { followRateLimitDecision, isEitherDirectionBlocked, selfFollowError } from "@/lib/follows";
import { isInviteEligible, normalizeInviteRef } from "@/lib/invites";
import { getServiceClient } from "@/lib/supabase/service";

function jsonError(error, status) {
  return NextResponse.json({ error }, { status });
}

async function blockCount(supabase, firstId, secondId) {
  const { count, error } = await supabase
    .from("user_blocks")
    .select("blocker_id", { count: "exact", head: true })
    .or(
      `and(blocker_id.eq.${firstId},blocked_id.eq.${secondId}),` +
        `and(blocker_id.eq.${secondId},blocked_id.eq.${firstId})`
    );
  if (error) throw new Error(`block lookup failed: ${error.message}`);
  return count ?? 0;
}

export async function POST(req) {
  const user = await getAuthedUser(req);
  if (!user) return jsonError("Unauthorized", 401);

  try {
    const payload = await req.json().catch(() => ({}));
    const ref = normalizeInviteRef(payload?.ref);
    if (!ref) return jsonError("Invalid invite.", 400);

    const supabase = getServiceClient();
    const [inviterResult, profileResult] = await Promise.all([
      supabase.from("profiles").select("id, username").eq("username", ref).maybeSingle(),
      supabase.from("profiles").select("id, created_at, invited_by").eq("id", user.id).single(),
    ]);
    if (inviterResult.error) throw new Error(`inviter lookup failed: ${inviterResult.error.message}`);
    if (profileResult.error) throw new Error(`profile lookup failed: ${profileResult.error.message}`);
    const inviter = inviterResult.data;
    if (!inviter) return jsonError("Inviter not found.", 404);
    const ownTargetError = selfFollowError(user.id, inviter.id);
    if (ownTargetError) return jsonError(ownTargetError, 400);
    if (!isInviteEligible({ createdAt: profileResult.data.created_at, invitedBy: profileResult.data.invited_by })) {
      return jsonError("This invite can no longer be accepted.", 409);
    }
    if (isEitherDirectionBlocked(await blockCount(supabase, user.id, inviter.id))) {
      return jsonError("This invite can't be accepted.", 403);
    }

    const { data: existing, error: existingError } = await supabase
      .from("follows")
      .select("follower_id")
      .eq("follower_id", user.id)
      .eq("followee_id", inviter.id)
      .maybeSingle();
    if (existingError) throw new Error(`follow lookup failed: ${existingError.message}`);

    if (!existing) {
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count, error: countError } = await supabase
        .from("follows")
        .select("followee_id", { count: "exact", head: true })
        .eq("follower_id", user.id)
        .gte("created_at", dayAgo);
      if (countError) throw new Error(`follow count failed: ${countError.message}`);
      const decision = followRateLimitDecision({
        accountCreatedAt: profileResult.data.created_at,
        recentFollows: count ?? 0,
      });
      if (!decision.allowed) return jsonError("Follow limit reached. Try again tomorrow.", 429);
    }

    const { data: claimed, error: claimError } = await supabase
      .from("profiles")
      .update({ invited_by: inviter.id })
      .eq("id", user.id)
      .is("invited_by", null)
      .select("id")
      .maybeSingle();
    if (claimError) throw new Error(`invite update failed: ${claimError.message}`);
    if (!claimed) return jsonError("This invite has already been accepted.", 409);

    if (!existing) {
      const { error: insertError } = await supabase
        .from("follows")
        .upsert(
          { follower_id: user.id, followee_id: inviter.id },
          { onConflict: "follower_id,followee_id", ignoreDuplicates: true }
        );
      if (insertError) throw new Error(`follow insert failed: ${insertError.message}`);
    }

    return NextResponse.json({ ok: true, followed: !existing });
  } catch (error) {
    console.error("POST /api/invites/accept failed:", error);
    return jsonError("Could not accept this invite.", 500);
  }
}
