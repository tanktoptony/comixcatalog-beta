import { SITE_URL } from "@/lib/siteUrl";
import { getIssueData } from "@/lib/pageData";
import { buildIssueDescription, issueName } from "@/lib/issueSeo";

export async function generateMetadata({ params }) {
  const { id } = await params;

  try {
    const issue = await getIssueData(id);
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
        url: `${SITE_URL}/issue/${id}`,
        type: "article",
        images: cover ? [{ url: cover, alt: `${title} cover` }] : undefined,
      },
      twitter: {
        card: "summary_large_image",
        title: `${title} | ComixCatalog`,
        description,
        images: cover ? [cover] : undefined,
      },
      alternates: { canonical: `${SITE_URL}/issue/${id}` },
    };
  } catch {
    return {};
  }
}

export default function IssueLayout({ children }) {
  return children;
}
