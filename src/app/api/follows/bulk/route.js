import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/authServer";
import { cleanUsername, splitFollowBatchByLimit } from "@/lib/follows";
import { getServiceClient } from "@/lib/supabase/service";

const MAX_BATCH = 50;

function responseResult(username, status, error) {
  return { username, status, ...(error ? { error } : {}) };
}

export async function POST(req) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const payload = await req.json().catch(() => null);
    if (!Array.isArray(payload?.usernames) || payload.usernames.length === 0) {
      return NextResponse.json({ error: "Usernames are required." }, { status: 400 });
    }
    if (payload.usernames.length > MAX_BATCH) {
      return NextResponse.json({ error: `A maximum of ${MAX_BATCH} usernames is allowed.` }, { status: 400 });
    }

    const requested = payload.usernames.map(cleanUsername);
    if (requested.some((username) => !username)) {
      return NextResponse.json({ error: "Every username must be a non-empty string." }, { status: 400 });
    }
    const usernames = [...new Set(requested)];
    const supabase = getServiceClient();
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, username, is_public")
      .in("username", usernames);
    if (profilesError) throw new Error(`profile lookup failed: ${profilesError.message}`);

    const profileByUsername = new Map((profiles ?? []).map((profile) => [profile.username, profile]));
    const eligibleProfiles = (profiles ?? []).filter((profile) => profile.is_public !== false && profile.id !== user.id);
    const targetIds = eligibleProfiles.map((profile) => profile.id);
    const [blocksResult, existingResult] = targetIds.length > 0 ? await Promise.all([
      supabase
        .from("user_blocks")
        .select("blocker_id, blocked_id")
        .or(`and(blocker_id.eq.${user.id},blocked_id.in.(${targetIds.join(",")})),and(blocked_id.eq.${user.id},blocker_id.in.(${targetIds.join(",")}))`),
      supabase.from("follows").select("followee_id").eq("follower_id", user.id).in("followee_id", targetIds),
    ]) : [{ data: [], error: null }, { data: [], error: null }];
    if (blocksResult.error) throw new Error(`block lookup failed: ${blocksResult.error.message}`);
    if (existingResult.error) throw new Error(`follow lookup failed: ${existingResult.error.message}`);

    const blockedIds = new Set((blocksResult.data ?? []).map((row) => row.blocker_id === user.id ? row.blocked_id : row.blocker_id));
    const existingIds = new Set((existingResult.data ?? []).map((row) => row.followee_id));
    const results = [];
    const candidates = [];
    for (const username of usernames) {
      const profile = profileByUsername.get(username);
      if (!profile || profile.is_public === false) results.push(responseResult(username, "not_found", "Member not found."));
      else if (profile.id === user.id) results.push(responseResult(username, "invalid", "You can't follow yourself."));
      else if (blockedIds.has(profile.id)) results.push(responseResult(username, "blocked", "You can't follow this member."));
      else if (existingIds.has(profile.id)) results.push(responseResult(username, "following"));
      else candidates.push(profile);
    }

    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [profileResult, recentResult] = await Promise.all([
      supabase.from("profiles").select("created_at").eq("id", user.id).single(),
      supabase.from("follows").select("followee_id", { count: "exact", head: true }).eq("follower_id", user.id).gte("created_at", dayAgo),
    ]);
    if (profileResult.error || !profileResult.data?.created_at) {
      throw new Error(`follower profile lookup failed: ${profileResult.error?.message || "missing created_at"}`);
    }
    if (recentResult.error) throw new Error(`follow count failed: ${recentResult.error.message}`);
    const split = splitFollowBatchByLimit({
      accountCreatedAt: profileResult.data.created_at,
      recentFollows: recentResult.count ?? 0,
      candidates,
    });

    if (split.accepted.length > 0) {
      const { error: insertError } = await supabase.from("follows").upsert(
        split.accepted.map((profile) => ({ follower_id: user.id, followee_id: profile.id })),
        { onConflict: "follower_id,followee_id", ignoreDuplicates: true }
      );
      if (insertError) throw new Error(`follow insert failed: ${insertError.message}`);
    }
    results.push(...split.accepted.map((profile) => responseResult(profile.username, "followed")));
    results.push(...split.rateLimited.map((profile) => responseResult(profile.username, "rate_limited", "Daily follow limit reached.")));
    const byUsername = new Map(results.map((result) => [result.username, result]));
    return NextResponse.json({
      results: requested.map((username) => byUsername.get(username)),
      followed_count: split.accepted.length,
      limit: split.limit,
    });
  } catch (error) {
    console.error("POST /api/follows/bulk failed:", error);
    return NextResponse.json({ error: "Could not follow these members." }, { status: 500 });
  }
}
