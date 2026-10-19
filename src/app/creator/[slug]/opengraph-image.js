import { getCreatorPage } from "@/lib/creatorData";
import { topCreatorRole } from "@/lib/creatorPage";
import { renderShelfCard, OG_SIZE } from "@/lib/og/card";
import { homeImage } from "@/app/opengraph-image";

export const alt = "Comic creator on ComixCatalog";
export const size = OG_SIZE;
export const contentType = "image/png";
export const revalidate = 604800;

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
