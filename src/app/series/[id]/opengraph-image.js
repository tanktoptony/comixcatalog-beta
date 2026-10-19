import { getSeriesData } from "@/lib/pageData";
import { renderCoverCard, OG_SIZE } from "@/lib/og/card";
import { homeImage } from "@/app/opengraph-image";

export const alt = "Comic series on ComixCatalog";
export const size = OG_SIZE;
export const contentType = "image/png";
export const revalidate = 604800;

function yearSpan(start, end) {
  if (!start) return null;
  return end && end !== start ? `${start}–${end}` : String(start);
}

export default async function Image({ params }) {
  try {
    const { id } = await params;
    const s = await getSeriesData(id);
    if (!s) return homeImage();
    const writers = (s.top_creators?.writers ?? []).slice(0, 2).map((c) => c.name);
    const artists = (s.top_creators?.artists ?? []).slice(0, 2).map((c) => c.name);
    const credits = [writers.length && `Written by ${writers.join(", ")}`, artists.length && `Art by ${artists.join(", ")}`]
      .filter(Boolean)
      .join(" · ");
    const keys = (s.key_issues ?? []).filter((k) => k.cover);
    return renderCoverCard({
      cover: s.featured_cover,
      title: s.title,
      eyebrow: [s.publisher, yearSpan(s.year_start, s.year_end)].filter(Boolean).join(" · "),
      pill: s.format_tag ? s.format_tag.toUpperCase() : null,
      lines: [credits],
      stats: [
        { value: s.issue_count, label: "issues" },
        { value: s.key_issues?.length, label: "key issues" },
      ],
      strip: { label: "KEY ISSUES", items: keys.map((k) => ({ cover: k.cover, caption: `#${k.issue_number}` })) },
    });
  } catch (error) {
    console.warn("series OG card failed:", error);
    return homeImage();
  }
}
