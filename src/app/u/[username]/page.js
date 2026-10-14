import { notFound } from "next/navigation";
import PrivateProfileOwnerView from "@/components/PrivateProfileOwnerView";
import ProfileView from "@/components/ProfileView";
import { getPublicProfile } from "@/lib/pageData";
import { getServiceClient } from "@/lib/supabase/service";

async function getProfileVisibility(username) {
  const { data, error } = await getServiceClient()
    .from("profiles")
    .select("is_public")
    .eq("username", username)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function getSellerFeedback(profileId) {
  const db = getServiceClient();
  const [{ data: rating, error: ratingError }, { count: sold, error: soldError }, feedbackResult] = await Promise.all([
    db.rpc("mkt_seller_rating", { p_seller: profileId }),
    db.from("orders").select("id", { count: "exact", head: true }).eq("seller_id", profileId).eq("status", "completed"),
    db.from("order_feedback").select("author_id,rating,comment,created_at").eq("subject_id", profileId).eq("author_role", "buyer").is("removed_at", null).lte("visible_at", new Date().toISOString()).neq("comment", "").order("created_at", { ascending: false }).limit(10),
  ]);
  if (ratingError) throw ratingError;
  if (soldError) throw soldError;
  if (feedbackResult.error) throw feedbackResult.error;
  const authorIds = [...new Set((feedbackResult.data || []).map((row) => row.author_id))];
  let profiles = [];
  if (authorIds.length > 0) {
    const profileResult = await db.from("profiles").select("id,username").in("id", authorIds);
    if (profileResult.error) throw profileResult.error;
    profiles = profileResult.data || [];
  }
  const names = new Map(profiles.map((profile) => [profile.id, profile.username]));
  return {
    rating,
    sold: sold || 0,
    comments: (feedbackResult.data || []).map((row) => ({ ...row, username: names.get(row.author_id) || "collector" })),
  };
}

export async function generateMetadata({ params }) {
  const { username } = await params;
  if (!username) return {};

  const data = await getPublicProfile(username);
  if (!data?.notFound) return {};

  const profile = await getProfileVisibility(username);
  return profile && profile.is_public === false
    ? { robots: { index: false, follow: false } }
    : {};
}

export default async function PublicProfilePage({ params }) {
  const { username } = await params;
  if (!username) notFound();

  // Public profiles retain the existing one-minute cached server render.
  const data = await getPublicProfile(username);
  if (!data?.notFound) {
    // The profile still renders if ratings can't load.
    const sellerFeedback = await getSellerFeedback(data.profile.id).catch((error) => {
      console.error("seller feedback load failed:", error);
      return null;
    });
    return <ProfileView data={{ ...data, sellerFeedback }} />;
  }

  // The public API intentionally hides private profiles as 404s. This
  // minimal service-role lookup distinguishes one from a missing username
  // without exposing any profile fields.
  const profile = await getProfileVisibility(username);
  if (!profile || profile.is_public !== false) notFound();

  return <PrivateProfileOwnerView username={username} />;
}
