import { getIssueData } from "@/lib/pageData";
import { getServiceClient } from "@/lib/supabase/service";
import { renderCoverCard, OG_SIZE } from "@/lib/og/card";
import { homeImage } from "@/app/opengraph-image";

export const alt = "Comic issue on ComixCatalog";
export const size = OG_SIZE;
export const contentType = "image/png";
export const revalidate = 604800;

// The page sends cv-<series>-<number> to the GCD issue when one exists;
// the card follows the same rule so it shows the full record.
async function resolveId(id) {
  const cv = String(id).match(/^cv-(\d+)-(.+)$/);
  if (cv) {
    const { data } = await getServiceClient()
      .from("gcd_issues")
      .select("gcd_id")
      .eq("series_gcd_id", Number(cv[1]))
      .eq("issue_number", cv[2])
      .is("variant_of_gcd_id", null)
      .limit(1)
      .maybeSingle();
    if (data?.gcd_id) return `gcd-${data.gcd_id}`;
  }
  return /^\d+$/.test(String(id)) ? `gcd-${id}` : id;
}

function creatorLine(credits = []) {
  const pick = (roles) => [...new Set(credits.filter((c) => roles.includes(c.role)).map((c) => c.name))].slice(0, 2);
  const writers = pick(["writer"]);
  const artists = pick(["penciller", "artist"]);
  return [writers.length && `Written by ${writers.join(", ")}`, artists.length && `Art by ${artists.join(", ")}`]
    .filter(Boolean)
    .join(" · ");
}

export default async function Image({ params }) {
  try {
    const { id } = await params;
    const x = await getIssueData(await resolveId(id));
    if (!x) return homeImage();
    const notKey = x.key_ruling?.verdict === "not_key";
    const key = notKey ? null : x.key_issue;
    const story = (x.stories ?? []).find((st) => st.type !== "cover" && st.title)?.title ?? x.title;
    const median = x.market?.median;
    return renderCoverCard({
      cover: x.cover,
      title: x.series_title || "Comic issue",
      issue: x.issue_number && x.issue_number !== "[nn]" ? `#${x.issue_number}` : null,
      eyebrow: [x.publisher, x.display_date || x.release_year].filter(Boolean).join(" · "),
      pill: key ? "KEY ISSUE" : null,
      lines: [
        key?.reason ? { children: key.reason, color: "#ecd48c", size: 22 } : story && { children: story, size: 22 },
        creatorLine(x.credits),
      ],
      stats: [
        { value: x.market?.listings_count, label: "for sale" },
        { value: median != null ? `$${Math.round(median)}` : null, label: "median sale" },
        { value: x.reprints?.reprintedIn?.length, label: "times reprinted" },
      ],
    });
  } catch (error) {
    console.warn("issue OG card failed:", error);
    return homeImage();
  }
}
