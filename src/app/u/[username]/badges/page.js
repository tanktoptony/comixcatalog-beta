import { notFound } from "next/navigation";
import Link from "next/link";
import BadgeGallery from "@/components/BadgeGallery";
import { BADGE_CATALOG } from "@/lib/badges/catalog";
import { getPublicProfile } from "@/lib/pageData";
import { getProfileBadges } from "@/lib/badges/server";

export async function generateMetadata({ params }) {
  const { username } = await params;
  return { title: `@${username}'s badges` };
}

export default async function BadgesPage({ params }) {
  const { username } = await params;
  const data = await getPublicProfile(username);
  if (data?.notFound || !data?.profile) notFound();
  const earned = await getProfileBadges(data.profile);
  const earnedIds = new Set(earned.map((badge) => badge.id));
  const visible = BADGE_CATALOG.filter((badge) => earnedIds.has(badge.id));
  const groupedMap = new Map();
  for (const badge of visible) {
    if (!groupedMap.has(badge.group)) groupedMap.set(badge.group, []);
    // Plain data only: BadgeGallery is a client component, and the catalog's
    // test() functions can't cross the server/client boundary.
    const { test: _test, ...display } = badge;
    groupedMap.get(badge.group).push({ badge: display, earned: true });
  }
  const grouped = [...groupedMap.entries()];
  return (
    <main className="badges-page">
      <Link href={`/u/${encodeURIComponent(username)}`} className="badges-back">Back to @{username}</Link>
      <h1>Collector <span>badges</span></h1>
      <p>Embroidered patches earned across the collection.</p>
      <BadgeGallery groups={grouped} profileId={data.profile.id} showcase={data.profile.showcase_badges ?? []} />
    </main>
  );
}
