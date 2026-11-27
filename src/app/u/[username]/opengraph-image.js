import { getPublicProfile } from "@/lib/pageData";
import { renderShelfCard, OG_SIZE } from "@/lib/og/card";
import { homeImage } from "@/app/opengraph-image";
import { getProfileBadges, selectShowcaseBadges } from "@/lib/badges/server";
import { badgeSvgDataUrl } from "@/lib/badges/svg";
import { cachedCard } from "@/lib/og/cache";

export const alt = "Collector profile on ComixCatalog";
export const size = OG_SIZE;
export const contentType = "image/png";
export const revalidate = 86400;
// Cached between refreshes (Next 16 renders route handlers on every request
// unless they are static): without these two lines every crawler hit
// re-rendered the card and re-fetched its covers (72,300 billed image
// transforms in Nov 2026). Unknown params render on first request, then
// come from the cache until `revalidate` runs out.
export const dynamic = "force-static";
export function generateStaticParams() {
  return [];
}

// Only what the public profile itself shows: getPublicProfile answers
// { notFound: true } for private profiles, and leaves `collection` empty
// when the owner hides it. Values are never drawn, even when public.
const coverOf = (x) => x.display?.canonicalCoverUrl || x.display?.personalCoverUrl || x.display?.communityCoverUrl;

// The profile page's own order: its Top Shelf (keys first, then value),
// then Recently Added.
export function profileCovers(data) {
  const top = data?.summary?.topShelf ?? [];
  const recent = data?.summary?.recentlyAdded ?? [];
  return [...new Set([...top, ...recent].map(coverOf).filter(Boolean))];
}

export function profileStats(data) {
  return [
    { value: data?.summary?.stats?.owned ?? 0, label: "books" },
    { value: data?.summary?.ownedSeries ?? 0, label: "series" },
    { value: data?.summary?.keyCount ?? 0, label: "keys" },
  ];
}

async function Image({ params }) {
  try {
    const { username } = await params;
    const d = await getPublicProfile(username);
    if (d?.notFound || !d?.profile) return homeImage();
    const p = d.profile;
    const showcase = selectShowcaseBadges(p, await getProfileBadges(p));
    return renderShelfCard({
      covers: profileCovers(d),
      title: p.display_name || `@${p.username}`,
      eyebrow: p.display_name ? `@${p.username}` : "Collector",
      pill: p.is_founding_collector ? "FOUNDING MEMBER" : null,
      lines: [p.location || null],
      stats: profileStats(d),
      badges: showcase.map((badge) => badgeSvgDataUrl(badge, badge.foundingNumber)),
    });
  } catch (error) {
    console.warn("profile OG card failed:", error);
    return homeImage();
  }
}

// Cached for `revalidate`, whatever the data caches say (src/lib/og/cache.js).
export default cachedCard(revalidate, Image);
