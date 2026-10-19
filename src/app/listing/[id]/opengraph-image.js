import { getListing } from "@/lib/marketplace";
import { conditionLabel, formatValue } from "@/lib/marketplaceFormat";
import { renderCoverCard, OG_SIZE } from "@/lib/og/card";
import { homeImage } from "@/app/opengraph-image";

export const alt = "A comic for sale on ComixCatalog";
export const size = OG_SIZE;
export const contentType = "image/png";
export const revalidate = 3600;

export default async function Image({ params }) {
  try {
    const { id } = await params;
    const l = await getListing(id);
    if (!l || l.status === "sold") return homeImage();
    return renderCoverCard({
      cover: l.cover,
      title: l.title,
      issue: l.issueNumber ? `#${l.issueNumber}` : null,
      eyebrow: [l.publisher, l.year].filter(Boolean).join(" · "),
      pill: "FOR SALE",
      lines: [conditionLabel(l), `from @${l.seller}`],
      stats: [{ value: l.price != null ? formatValue(l.price) : "Open to offers", label: "price" }],
    });
  } catch (error) {
    console.warn("listing OG card failed:", error);
    return homeImage();
  }
}
