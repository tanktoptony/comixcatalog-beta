import { getSeriesData } from "@/lib/pageData";
import { renderShelfCard, OG_SIZE } from "@/lib/og/card";
import { homeImage } from "@/app/opengraph-image";

export const alt = "Comic key issue guide on ComixCatalog";
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

export default async function Image({ params }) {
  try {
    const { id } = await params;
    const series = await getSeriesData(id);
    if (!series) return homeImage();
    const keys = series.key_issues ?? [];
    const majorCount = keys.filter((issue) => Number(issue.tier) === 1).length;
    return renderShelfCard({
      covers: keys.map((issue) => issue.cover).filter(Boolean),
      eyebrow: "Collector guide",
      title: `Every ${series.title} key issue`,
      stats: [
        { value: keys.length, label: "key issues" },
        { value: majorCount, label: "major keys" },
      ],
    });
  } catch (error) {
    console.warn("series keys OG card failed:", error);
    return homeImage();
  }
}
