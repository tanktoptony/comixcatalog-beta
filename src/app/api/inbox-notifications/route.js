import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/authServer";
import { getServiceClient } from "@/lib/supabase/service";

function jsonError(error, status) {
  return NextResponse.json({ error }, { status });
}

export async function GET(req) {
  const user = await getAuthedUser(req);
  if (!user) return jsonError("Unauthorized", 401);

  try {
    const supabase = getServiceClient();
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("created_at, followers_seen_at")
      .eq("id", user.id)
      .single();
    if (profileError) throw new Error(`profile lookup failed: ${profileError.message}`);
    const cutoff = profile.followers_seen_at || profile.created_at;

    const [messagesResult, followersResult, followerRowsResult, purchasesResult, purchaseRowsResult] = await Promise.all([
      supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", user.id)
        .is("read_at", null),
      supabase
        .from("follows")
        .select("follower_id", { count: "exact", head: true })
        .eq("followee_id", user.id)
        .gt("created_at", cutoff),
      supabase
        .from("follows")
        .select("follower_id, created_at")
        .eq("followee_id", user.id)
        .gt("created_at", cutoff)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase.from("sold_items").select("id", { count: "exact", head: true }).eq("buyer_id", user.id).eq("status", "pending_buyer"),
      supabase.from("sold_items").select("id, seller_id, series_title, issue_number, sale_price, currency, sold_at").eq("buyer_id", user.id).eq("status", "pending_buyer").order("sold_at", { ascending: false }).limit(10),
    ]);
    const queryError = messagesResult.error || followersResult.error || followerRowsResult.error || purchasesResult.error || purchaseRowsResult.error;
    if (queryError) throw new Error(`notification lookup failed: ${queryError.message}`);

    const followerRows = followerRowsResult.data ?? [];
    const followerIds = followerRows.map((row) => row.follower_id);
    let profiles = [];
    let followingIds = new Set();
    if (followerIds.length > 0) {
      const [profilesResult, followingResult] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, username, display_name, avatar_url, avatar_key")
          .in("id", followerIds),
        supabase
          .from("follows")
          .select("followee_id")
          .eq("follower_id", user.id)
          .in("followee_id", followerIds),
      ]);
      if (profilesResult.error || followingResult.error) {
        throw new Error(`follower details failed: ${(profilesResult.error || followingResult.error).message}`);
      }
      profiles = profilesResult.data ?? [];
      followingIds = new Set((followingResult.data ?? []).map((row) => row.followee_id));
    }
    const profilesById = new Map(profiles.map((profileRow) => [profileRow.id, profileRow]));
    const recentFollowers = followerRows.flatMap((row) => {
      const follower = profilesById.get(row.follower_id);
      return follower ? [{ ...follower, followed_at: row.created_at, following: followingIds.has(row.follower_id) }] : [];
    });
    const sellerIds = [...new Set((purchaseRowsResult.data ?? []).map((row) => row.seller_id))];
    const { data: sellers, error: sellersError } = sellerIds.length ? await supabase.from("profiles").select("id, username").in("id", sellerIds) : { data: [] };
    if (sellersError) throw sellersError;
    const sellerNames = new Map((sellers ?? []).map((seller) => [seller.id, seller.username]));

    return NextResponse.json({
      messages: messagesResult.count ?? 0,
      followers: followersResult.count ?? 0,
      recentFollowers,
      purchases: purchasesResult.count ?? 0,
      pendingPurchases: (purchaseRowsResult.data ?? []).map((row) => ({ ...row, seller_username: sellerNames.get(row.seller_id) || "unknown" })),
    });
  } catch (error) {
    console.error("GET /api/inbox-notifications failed:", error);
    return jsonError("Could not load inbox notifications.", 500);
  }
}

export async function POST(req) {
  const user = await getAuthedUser(req);
  if (!user) return jsonError("Unauthorized", 401);
  try {
    const supabase = getServiceClient();
    const { error } = await supabase
      .from("profiles")
      .update({ followers_seen_at: new Date().toISOString() })
      .eq("id", user.id);
    if (error) throw new Error(`followers seen update failed: ${error.message}`);
    return NextResponse.json({ followers: 0 });
  } catch (error) {
    console.error("POST /api/inbox-notifications failed:", error);
    return jsonError("Could not update follower notifications.", 500);
  }
}
