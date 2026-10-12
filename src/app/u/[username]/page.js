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
  if (!data?.notFound) return <ProfileView data={data} />;

  // The public API intentionally hides private profiles as 404s. This
  // minimal service-role lookup distinguishes one from a missing username
  // without exposing any profile fields.
  const profile = await getProfileVisibility(username);
  if (!profile || profile.is_public !== false) notFound();

  return <PrivateProfileOwnerView username={username} />;
}
