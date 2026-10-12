import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/authServer";
import { cleanUsername } from "@/lib/follows";
import { getServiceClient } from "@/lib/supabase/service";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const username = cleanUsername(searchParams.get("username"));
  if (!username) return NextResponse.json({ error: "Username is required." }, { status: 400 });
  try {
    const supabase = getServiceClient();
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("id, is_public")
      .eq("username", username)
      .maybeSingle();
    if (error) throw new Error(`profile lookup failed: ${error.message}`);
    if (!profile || profile.is_public === false) return NextResponse.json({ error: "Member not found." }, { status: 404 });
    const viewer = await getAuthedUser(req);
    const followersQuery = supabase.from("follows").select("follower_id", { count: "exact", head: true }).eq("followee_id", profile.id);
    const followingQuery = supabase.from("follows").select("followee_id", { count: "exact", head: true }).eq("follower_id", profile.id);
    const viewerQuery = viewer
      ? supabase.from("follows").select("follower_id", { count: "exact", head: true }).eq("follower_id", viewer.id).eq("followee_id", profile.id)
      : Promise.resolve({ count: 0, error: null });
    const [followers, following, viewerFollow] = await Promise.all([followersQuery, followingQuery, viewerQuery]);
    const countError = followers.error || following.error || viewerFollow.error;
    if (countError) throw new Error(`follow count failed: ${countError.message}`);
    return NextResponse.json({
      following: (viewerFollow.count ?? 0) > 0,
      followers: followers.count ?? 0,
      following_count: following.count ?? 0,
    });
  } catch (error) {
    console.error("GET /api/follows/status failed:", error);
    return NextResponse.json({ error: "Could not load follow status." }, { status: 500 });
  }
}
