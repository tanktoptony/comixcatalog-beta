import { getCreatorPage } from "@/lib/creatorData";
import { topCreatorRole } from "@/lib/creatorPage";
import { renderShelfCard, OG_SIZE } from "@/lib/og/card";
import { homeImage } from "@/app/opengraph-image";

export const alt = "Comic creator on ComixCatalog";
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

const roleLabel = (role) => (role === "cover" ? "Cover artist" : role ? `${role[0].toUpperCase()}${role.slice(1)}` : "Creator");

export default async function Image({ params }) {
  try {
    const { slug } = await params;
    const c = await getCreatorPage(slug);
    if (!c) return homeImage();
    const covers = [...new Set([...(c.key_issues ?? []), ...(c.runs ?? [])].map((x) => x.cover).filter(Boolean))];
    const years = c.year_start ? [c.year_start, c.year_end].filter(Boolean).join("–") : null;
    const topRuns = (c.runs ?? []).slice(0, 3).map((r) => r.title);
    return renderShelfCard({
      covers,
      title: c.name,
      eyebrow: [roleLabel(topCreatorRole(c.role_counts)), years].filter(Boolean).join(" · "),
      lines: [topRuns.length ? topRuns.join(", ") : null],
      stats: [
        { value: c.credit_count, label: "credits" },
        { value: c.capped ? null : c.runs?.length, label: "series" },
        { value: c.capped ? null : c.key_issues?.length, label: "key issues" },
      ],
    });
  } catch (error) {
    console.warn("creator OG card failed:", error);
    return homeImage();
  }
}
