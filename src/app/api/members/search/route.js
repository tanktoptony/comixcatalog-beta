import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/authServer";
import { escapeLike } from "@/lib/follows";
import { getServiceClient } from "@/lib/supabase/service";

const PROFILE_COLUMNS = "id, username, display_name, avatar_url";

async function memberQuery(supabase, column, pattern) {
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .not("is_public", "eq", false)
    .not("username", "is", null)
    .ilike(column, pattern)
    .order("username", { ascending: true })
    .limit(20);
  if (error) throw new Error(`member search failed: ${error.message}`);
  return data ?? [];
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  if (q.length < 2) return NextResponse.json({ error: "Search must be at least 2 characters." }, { status: 400 });
  try {
    const supabase = getServiceClient();
    const viewer = await getAuthedUser(req);
    const literal = escapeLike(q);
    const [usernamePrefix, namePrefix, usernameContains, nameContains] = await Promise.all([
      memberQuery(supabase, "username", `${literal}%`),
      memberQuery(supabase, "display_name", `${literal}%`),
      memberQuery(supabase, "username", `%${literal}%`),
      memberQuery(supabase, "display_name", `%${literal}%`),
    ]);
    const ordered = [];
    const seen = new Set();
    for (const profile of [...usernamePrefix, ...namePrefix, ...usernameContains, ...nameContains]) {
      if (profile.id === viewer?.id || seen.has(profile.id)) continue;
      seen.add(profile.id);
      ordered.push(profile);
      if (ordered.length === 20) break;
    }

    let followed = new Set();
    if (viewer && ordered.length > 0) {
      const { data, error } = await supabase
        .from("follows")
        .select("followee_id")
        .eq("follower_id", viewer.id)
        .in("followee_id", ordered.map((profile) => profile.id));
      if (error) throw new Error(`follow status lookup failed: ${error.message}`);
      followed = new Set((data ?? []).map((row) => row.followee_id));
    }
    return NextResponse.json(
      ordered.map((profile) => ({
        username: profile.username,
        display_name: profile.display_name,
        avatar_url: profile.avatar_url,
        following: followed.has(profile.id),
      }))
    );
  } catch (error) {
    console.error("GET /api/members/search failed:", error);
    return NextResponse.json({ error: "Could not search members." }, { status: 500 });
  }
}
