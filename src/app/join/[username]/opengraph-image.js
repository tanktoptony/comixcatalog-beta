import { getPublicProfile } from "@/lib/pageData";
import { loadClassicCovers } from "@/lib/heroWall";
import { renderShelfCard, OG_SIZE } from "@/lib/og/card";
import { homeImage } from "@/app/opengraph-image";
import { profileCovers } from "@/app/u/[username]/opengraph-image";
import { normalizeInviteRef } from "@/lib/invites";

export const alt = "An invitation to ComixCatalog";
export const size = OG_SIZE;
export const contentType = "image/png";
export const revalidate = 86400;

// A public inviter's own shelf; a private one gets the classic keys wall,
// so an invite never shows books its owner keeps private.
export default async function Image({ params }) {
  try {
    const { username } = await params;
    const clean = normalizeInviteRef(username);
    if (!clean) return homeImage();
    const d = await getPublicProfile(clean);
    const isPublic = d && !d.notFound && d.profile;
    let covers = isPublic ? profileCovers(d) : [];
    if (!covers.length) covers = (await loadClassicCovers().catch(() => [])).map((c) => c.cover);
    return renderShelfCard({
      covers,
      eyebrow: "You're invited",
      title: `@${isPublic ? d.profile.username : clean} wants you on ComixCatalog`,
      titleMax: 64,
      lines: [{ children: "Catalog your comics, track what they're worth, and follow each other's collections.", size: 22 }],
    });
  } catch (error) {
    console.warn("invite OG card failed:", error);
    return homeImage();
  }
}
