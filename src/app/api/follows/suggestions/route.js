import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/authServer";
import { getServiceClient } from "@/lib/supabase/service";
import { excludeTestAccounts } from "@/lib/traction";
import { rankSuggestionSections } from "@/lib/socialSuggestions";

async function hydrateSuggestions(supabase, reasons, viewerId) {
  const ids = reasons.map((row) => row.user_id);
  if (ids.length === 0) return [];
  const [profilesResult, countsResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url, avatar_key, is_public, is_founding_collector, is_pro, membership_tier")
      .in("id", ids),
    supabase
      .from("user_collections")
      .select("user_id")
      .in("user_id", ids)
      .in("status", ["owned", "for_sale"]),
  ]);
  if (profilesResult.error) throw new Error(`suggestion profile lookup failed: ${profilesResult.error.message}`);
  if (countsResult.error) throw new Error(`suggestion counts failed: ${countsResult.error.message}`);
  const countById = new Map();
  for (const row of countsResult.data ?? []) countById.set(row.user_id, (countById.get(row.user_id) ?? 0) + 1);
  const reasonById = new Map(reasons.map((row) => [row.user_id, row]));
  return excludeTestAccounts(profilesResult.data ?? [])
    .filter((profile) => profile.is_public !== false && profile.id !== viewerId)
    .map((profile) => ({
      ...profile,
      ...reasonById.get(profile.id),
      owned_count: countById.get(profile.id) ?? 0,
      following: false,
    }))
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
}

export async function GET(req) {
  try {
    const viewer = await getAuthedUser(req);
    const supabase = getServiceClient();
    let suggestions;
    let sections = null;
    if (viewer) {
      const result = await supabase.rpc("people_suggestions", { p_viewer: viewer.id, p_limit: 36 });
      if (!result.error) {
        suggestions = await hydrateSuggestions(supabase, result.data ?? [], viewer.id);
        sections = rankSuggestionSections(suggestions);
      } else if (!/people_suggestions|schema cache|does not exist/i.test(result.error.message || "")) {
        throw new Error(`people suggestions failed: ${result.error.message}`);
      }
    }
    if (!suggestions) {
      const { data, error } = await supabase.rpc("suggested_collectors", {
        p_viewer_id: viewer?.id ?? null,
        p_limit: 24,
      });
      if (error) throw new Error(`suggested collectors failed: ${error.message}`);
      suggestions = excludeTestAccounts(data ?? []).map((member) => ({
        ...member,
        user_id: member.id,
        reason_kind: "fallback",
        reason_text: "Active collector",
        score: Number(member.owned_count || 0),
      }));
      sections = rankSuggestionSections(suggestions);
    }
    const welcome = new URL(req.url).searchParams.get("welcome") === "1";
    if (!viewer) return NextResponse.json({ signedOut: true, publicCollectors: suggestions });
    if (!welcome) return NextResponse.json({ ...sections, publisherName: sections.publisherCollectors[0]?.reason_text?.replace(/ collector$/, "") || null });

    const { data: ownProfile, error: ownError } = await supabase
      .from("profiles")
      .select("invited_by")
      .eq("id", viewer.id)
      .single();
    if (ownError) throw new Error(`viewer invite lookup failed: ${ownError.message}`);
    if (!ownProfile.invited_by) return NextResponse.json({ ...sections, publisherName: sections.publisherCollectors[0]?.reason_text?.replace(/ collector$/, "") || null });

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
    if (!inviterResult.data || inviterResult.data.is_public === false || excludeTestAccounts([inviterResult.data]).length === 0) return NextResponse.json({ ...sections, publisherName: sections.publisherCollectors[0]?.reason_text?.replace(/ collector$/, "") || null });

    const inviter = {
      ...inviterResult.data,
      owned_count: ownedResult.count ?? 0,
      following: (followResult.count ?? 0) > 0,
      invited_you: true,
    };
    return NextResponse.json({
      ...sections,
      peopleYouMayKnow: [{ ...inviter, user_id: inviter.id, reason_text: "Invited you", reason_kind: "followed_by", score: 1000 }, ...sections.peopleYouMayKnow.filter((member) => member.id !== inviter.id)],
      publisherName: sections.publisherCollectors[0]?.reason_text?.replace(/ collector$/, "") || null,
    });
  } catch (error) {
    console.error("GET /api/follows/suggestions failed:", error);
    return NextResponse.json({ error: "Could not load collector suggestions." }, { status: 500 });
  }
}
