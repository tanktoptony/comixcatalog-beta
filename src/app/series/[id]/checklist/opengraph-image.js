import { getSeriesData } from "@/lib/pageData";
import { renderCoverCard, OG_SIZE } from "@/lib/og/card";
import { homeImage } from "@/app/opengraph-image";
import { cachedCard } from "@/lib/og/cache";

export const alt = "Comic run checklist on ComixCatalog";
export const size = OG_SIZE;
export const contentType = "image/png";
export const revalidate = 604800;
// Cached between refreshes (Next 16 renders route handlers on every request
// unless they are static): without these two lines every crawler hit
// re-rendered the card and re-fetched its covers (72,300 billed image
// transforms in Nov 2026). Unknown params render on first request, then
// come from the cache until `revalidate` runs out.
export const dynamic = "force-static";
export function generateStaticParams() {
  return [];
}

async function Image({ params }) {
  try {
    const { id } = await params;
    const series = await getSeriesData(id);
    if (!series) return homeImage();
    return renderCoverCard({
      cover: series.featured_cover,
      eyebrow: "Printable run checklist",
      title: `${series.title} checklist`,
      stats: [
        { value: series.issues?.length ?? 0, label: "issues" },
        { value: series.key_issues?.length ?? 0, label: "key issues" },
      ],
    });
  } catch (error) {
    console.warn("series checklist OG card failed:", error);
    return homeImage();
  }
}

// Cached for `revalidate`, whatever the data caches say (src/lib/og/cache.js).
export default cachedCard(revalidate, Image);
