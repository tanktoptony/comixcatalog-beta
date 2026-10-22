import { getSeriesData } from "@/lib/pageData";
import { renderCoverCard, OG_SIZE } from "@/lib/og/card";
import { homeImage } from "@/app/opengraph-image";

export const alt = "Comic run checklist on ComixCatalog";
export const size = OG_SIZE;
export const contentType = "image/png";
export const revalidate = 604800;

export default async function Image({ params }) {
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
