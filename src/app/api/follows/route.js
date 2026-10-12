import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/authServer";
import {
  cleanUsername,
  followRateLimitDecision,
  isEitherDirectionBlocked,
  selfFollowError,
} from "@/lib/follows";
import { getServiceClient } from "@/lib/supabase/service";

function jsonError(error, status) {
  return NextResponse.json({ error }, { status });
}

async function targetFromRequest(req, supabase, { allowPrivate = false } = {}) {
  let payload;
  try {
    payload = await req.json();
  } catch {
    return { response: jsonError("Invalid request body.", 400) };
  }
  const username = cleanUsername(payload?.username);
  if (!username) return { response: jsonError("Username is required.", 400) };
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, is_public")
    .eq("username", username)
    .maybeSingle();
  if (error) throw new Error(`profile lookup failed: ${error.message}`);
  if (!data || (!allowPrivate && data.is_public === false)) return { response: jsonError("Member not found.", 404) };
  return { target: data };
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
    const supabase = getServiceClient();
    const { target, response } = await targetFromRequest(req, supabase);
    if (response) return response;
    const ownTargetError = selfFollowError(user.id, target.id);
    if (ownTargetError) return jsonError(ownTargetError, 400);
    if (isEitherDirectionBlocked(await blockCount(supabase, user.id, target.id))) {
      return jsonError("You can't follow this member.", 403);
    }

    const { data: existing, error: existingError } = await supabase
      .from("follows")
      .select("follower_id")
      .eq("follower_id", user.id)
      .eq("followee_id", target.id)
      .maybeSingle();
    if (existingError) throw new Error(`follow lookup failed: ${existingError.message}`);
    if (existing) return NextResponse.json({ following: true });

    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [profileResult, recentResult] = await Promise.all([
      supabase.from("profiles").select("created_at").eq("id", user.id).single(),
      supabase
        .from("follows")
        .select("followee_id", { count: "exact", head: true })
        .eq("follower_id", user.id)
        .gte("created_at", dayAgo),
    ]);
    if (profileResult.error || !profileResult.data?.created_at) {
      throw new Error(`follower profile lookup failed: ${profileResult.error?.message || "missing created_at"}`);
    }
    if (recentResult.error) throw new Error(`follow count failed: ${recentResult.error.message}`);
    const decision = followRateLimitDecision({
      accountCreatedAt: profileResult.data.created_at,
      recentFollows: recentResult.count ?? 0,
    });
    if (!decision.allowed) return jsonError("You've followed a lot of members today. Try again tomorrow.", 429);

    const { error: insertError } = await supabase
      .from("follows")
      .upsert(
        { follower_id: user.id, followee_id: target.id },
        { onConflict: "follower_id,followee_id", ignoreDuplicates: true }
      );
    if (insertError) throw new Error(`follow insert failed: ${insertError.message}`);
    return NextResponse.json({ following: true }, { status: 201 });
  } catch (error) {
    console.error("POST /api/follows failed:", error);
    return jsonError("Could not follow this member.", 500);
  }
}

export async function DELETE(req) {
  const user = await getAuthedUser(req);
  if (!user) return jsonError("Unauthorized", 401);
  try {
    const supabase = getServiceClient();
    const { target, response } = await targetFromRequest(req, supabase, { allowPrivate: true });
    if (response) return response;
    const { error } = await supabase
      .from("follows")
      .delete()
      .eq("follower_id", user.id)
      .eq("followee_id", target.id);
    if (error) throw new Error(`unfollow failed: ${error.message}`);
    return NextResponse.json({ following: false });
  } catch (error) {
    console.error("DELETE /api/follows failed:", error);
    return jsonError("Could not unfollow this member.", 500);
  }
}

export async function GET(req) {
  const user = await getAuthedUser(req);
  if (!user) return jsonError("Unauthorized", 401);
  const { searchParams } = new URL(req.url);
  const list = searchParams.get("list");
  if (list !== "following" && list !== "followers") return jsonError("Invalid list.", 400);
  const limit = Math.min(100, Math.max(1, Number.parseInt(searchParams.get("limit") || "50", 10) || 50));
  const offset = Math.max(0, Number.parseInt(searchParams.get("offset") || "0", 10) || 0);
  const ownColumn = list === "following" ? "follower_id" : "followee_id";
  const memberColumn = list === "following" ? "followee_id" : "follower_id";
  try {
    const supabase = getServiceClient();
    const { data: rows, error } = await supabase
      .from("follows")
      .select(`${memberColumn}, created_at`)
      .eq(ownColumn, user.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw new Error(`follow list failed: ${error.message}`);
    const ids = (rows ?? []).map((row) => row[memberColumn]);
    if (ids.length === 0) return NextResponse.json([]);
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url, avatar_key, is_public")
      .in("id", ids);
    if (profilesError) throw new Error(`follow profiles failed: ${profilesError.message}`);
    const byId = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
    return NextResponse.json(
      (rows ?? []).flatMap((row) => {
        const profile = byId.get(row[memberColumn]);
        return profile ? [{
          id: profile.id,
          username: profile.username,
          display_name: profile.display_name,
          avatar_url: profile.avatar_url,
          avatar_key: profile.avatar_key,
          is_public: profile.is_public,
          followed_at: row.created_at,
        }] : [];
      })
    );
  } catch (error) {
    console.error("GET /api/follows failed:", error);
    return jsonError("Could not load follows.", 500);
  }
}
