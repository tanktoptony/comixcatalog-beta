import { getPublicProfile } from "@/lib/pageData";
import { renderShelfCard, OG_SIZE } from "@/lib/og/card";
import { homeImage } from "@/app/opengraph-image";
import { isOwnedStatus } from "@/lib/collectionStatus";

export const alt = "Collector profile on ComixCatalog";
export const size = OG_SIZE;
export const contentType = "image/png";
export const revalidate = 86400;

// Only what the public profile itself shows: getPublicProfile answers
// { notFound: true } for private profiles, and leaves `collection` empty
// when the owner hides it. Values are never drawn, even when public.
const owned = (data) => (data?.collection ?? []).filter((x) => isOwnedStatus(x.status));
const coverOf = (x) => x.display?.canonicalCoverUrl || x.display?.personalCoverUrl || x.display?.communityCoverUrl;
const shelfScore = (x) => (x.key_issue ? (x.key_issue.tier === 1 ? 2_000_000 : 1_000_000) : 0) + (Number(x.market_value) || 0);

// The profile page's own order: its Top Shelf (keys first, then value),
// then Recently Added.
export function profileCovers(data) {
  const books = owned(data).filter((x) => x.display);
  const top = books.filter((x) => x.key_issue || Number(x.market_value) > 0).sort((a, b) => shelfScore(b) - shelfScore(a));
  return [...new Set([...top.slice(0, 5), ...books].map(coverOf).filter(Boolean))];
}

export function profileStats(data) {
  const books = owned(data);
  return [
    { value: books.length, label: "books" },
    { value: new Set(books.map((x) => x.display?.title).filter(Boolean)).size, label: "series" },
    { value: books.filter((x) => x.key_issue).length, label: "keys" },
  ];
}

export default async function Image({ params }) {
  try {
    const { username } = await params;
    const d = await getPublicProfile(username);
    if (d?.notFound || !d?.profile) return homeImage();
    const p = d.profile;
    return renderShelfCard({
      covers: profileCovers(d),
      title: p.display_name || `@${p.username}`,
      eyebrow: p.display_name ? `@${p.username}` : "Collector",
      pill: p.is_founding_collector ? "FOUNDING MEMBER" : null,
      lines: [p.location || null],
      stats: profileStats(d),
    });
  } catch (error) {
    console.warn("profile OG card failed:", error);
    return homeImage();
  }
}
