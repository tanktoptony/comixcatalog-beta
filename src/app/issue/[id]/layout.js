import { SITE_URL } from "@/lib/siteUrl";
import { getIssueData, resolveIssueEdition } from "@/lib/pageData";
import { buildIssueDescription, issueName } from "@/lib/issueSeo";

export async function generateMetadata({ params }) {
  const { id } = await params;

  try {
    // Canonical is always the base edition's /issue/gcd-<n> URL.
    const gcdNumber = String(id).match(/^(?:gcd-)?(\d+)$/)?.[1] ?? null;
    const resolution = gcdNumber ? await resolveIssueEdition(gcdNumber) : null;
    const canonicalId = resolution?.baseGcdId ? `gcd-${resolution.baseGcdId}` : gcdNumber ? `gcd-${gcdNumber}` : id;
    const issue = await getIssueData(gcdNumber ? `gcd-${gcdNumber}` : id);
    if (!issue) throw new Error("no issue");

    const cover = issue.cover || null;
    const title = issueName(issue);
    const description = buildIssueDescription(issue);

    return {
      title,
      description,
      openGraph: {
        title: `${title} | ComixCatalog`,
        description,
        url: `${SITE_URL}/issue/${canonicalId}`,
        type: "article",
        images: cover ? [{ url: cover, alt: `${title} cover` }] : undefined,
      },
      twitter: {
        card: "summary_large_image",
        title: `${title} | ComixCatalog`,
        description,
        images: cover ? [cover] : undefined,
      },
      alternates: { canonical: `${SITE_URL}/issue/${canonicalId}` },
    };
  } catch {
    return {};
  }
}

export default function IssueLayout({ children }) {
  return children;
}
