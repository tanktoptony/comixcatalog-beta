import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/authServer";
import { getServiceClient } from "@/lib/supabase/service";

export async function GET(req) {
  try {
    const viewer = await getAuthedUser(req);
    const supabase = getServiceClient();
    const { data, error } = await supabase.rpc("suggested_collectors", {
      p_viewer_id: viewer?.id ?? null,
      p_limit: 24,
    });
    if (error) throw new Error(`suggested collectors failed: ${error.message}`);
    const suggestions = data ?? [];
    const welcome = new URL(req.url).searchParams.get("welcome") === "1";
    if (!viewer || !welcome) return NextResponse.json(suggestions);

    const { data: ownProfile, error: ownError } = await supabase
      .from("profiles")
      .select("invited_by")
      .eq("id", viewer.id)
      .single();
    if (ownError) throw new Error(`viewer invite lookup failed: ${ownError.message}`);
    if (!ownProfile.invited_by) return NextResponse.json(suggestions);

    const [inviterResult, followResult, ownedResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, avatar_key, is_public, is_founding_collector, is_pro, membership_tier")
        .eq("id", ownProfile.invited_by)
        .maybeSingle(),
      supabase
        .from("follows")
        .select("follower_id", { count: "exact", head: true })
        .eq("follower_id", viewer.id)
        .eq("followee_id", ownProfile.invited_by),
      supabase
        .from("user_collections")
        .select("id", { count: "exact", head: true })
        .eq("user_id", ownProfile.invited_by)
        .in("status", ["owned", "for_sale"]),
    ]);
    if (inviterResult.error) throw new Error(`inviter profile lookup failed: ${inviterResult.error.message}`);
    if (followResult.error) throw new Error(`inviter follow lookup failed: ${followResult.error.message}`);
    if (ownedResult.error) throw new Error(`inviter collection count failed: ${ownedResult.error.message}`);
    if (!inviterResult.data || inviterResult.data.is_public === false) return NextResponse.json(suggestions);

    const inviter = {
      ...inviterResult.data,
      owned_count: ownedResult.count ?? 0,
      following: (followResult.count ?? 0) > 0,
      invited_you: true,
    };
    return NextResponse.json([inviter, ...suggestions.filter((member) => member.id !== inviter.id)]);
  } catch (error) {
    console.error("GET /api/follows/suggestions failed:", error);
    return NextResponse.json({ error: "Could not load collector suggestions." }, { status: 500 });
  }
}
