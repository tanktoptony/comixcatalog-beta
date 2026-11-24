import { getListing } from "@/lib/marketplace";
import { conditionLabel, formatValue } from "@/lib/marketplaceFormat";
import { renderCoverCard, OG_SIZE } from "@/lib/og/card";
import { homeImage } from "@/app/opengraph-image";
import { cachedCard } from "@/lib/og/cache";
import { issueNumberText } from "@/lib/issueNumberLabel";

export const alt = "A comic for sale on ComixCatalog";
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

async function Image({ params }) {
  try {
    const { id } = await params;
    const l = await getListing(id);
    if (!l || l.status === "sold") return homeImage();
    return renderCoverCard({
      cover: l.cover,
      title: l.title,
      issue: (issueNumberText(l.issueNumber) || null),
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

// Cached for `revalidate`, whatever the data caches say (src/lib/og/cache.js).
export default cachedCard(revalidate, Image);
