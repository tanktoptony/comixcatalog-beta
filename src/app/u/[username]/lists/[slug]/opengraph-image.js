import { homeImage } from "@/app/opengraph-image";
import { getListPage } from "@/lib/listsData";
import { OG_SIZE, renderShelfCard } from "@/lib/og/card";

export const alt = "A comic list on ComixCatalog";
export const size = OG_SIZE;
export const contentType = "image/png";
export const revalidate = 3600;
// Cached between refreshes (Next 16 renders route handlers on every request
// unless they are static): without these two lines every crawler hit
// re-rendered the card and re-fetched its covers (72,300 billed image
// transforms in Nov 2026). Unknown params render on first request, then
// come from the cache until `revalidate` runs out.
export const dynamic = "force-static";
export function generateStaticParams() {
  return [];
}

export default async function Image({ params }) {
  try {
    const { username, slug } = await params;
    const data = await getListPage(username, slug);
    if (!data) return homeImage();

    return renderShelfCard({
      covers: data.items
        .slice(0, 6)
        .map((item) => item.cover)
        .filter(Boolean),
      title: data.list.title,
      eyebrow: `A list by @${username}`,
      lines: [`${data.items.length} books`],
      stats: [],
    });
  } catch {
    return homeImage();
  }
}
