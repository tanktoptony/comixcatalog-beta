// Per-issue metadata. Runs on the server and fetches the same /api/issues/[id]
// the page uses, so the title and OG card reflect the actual issue. The page
// itself stays a client component for the interactive add-to-collection logic.

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://comixcatalog.com";

export async function generateMetadata({ params }) {
  const { id } = await params;

  try {
    const res = await fetch(`${SITE_URL}/api/issues/${id}`, {
      // Issue metadata changes rarely; cache for an hour.
      next: { revalidate: 3600 },
    });
    if (!res.ok) throw new Error("issue fetch failed");
    const data = await res.json();
    const issue = data?.issue;
    if (!issue) throw new Error("no issue");

    const seriesTitle = issue.series_title || "Untitled";
    const issueNumber = issue.issue_number || "";
    const year = issue.release_year || "";
    const publisher = issue.publisher || "";
    const cover = issue.cover || null;

    const title = `${seriesTitle}${issueNumber ? ` #${issueNumber}` : ""}${year ? ` (${year})` : ""}`;
    const descriptionParts = [
      `${seriesTitle}${issueNumber ? ` #${issueNumber}` : ""}`,
      publisher,
      year ? String(year) : null,
      "Cataloged on ComixCatalog.",
    ].filter(Boolean);

    return {
      title,
      description: descriptionParts.join(" · "),
      openGraph: {
        title: `${title} — ComixCatalog`,
        description: descriptionParts.join(" · "),
        url: `${SITE_URL}/issue/${id}`,
        type: "article",
        images: cover ? [{ url: cover, alt: title }] : undefined,
      },
      twitter: {
        card: "summary_large_image",
        title: `${title} — ComixCatalog`,
        description: descriptionParts.join(" · "),
        images: cover ? [cover] : undefined,
      },
      alternates: { canonical: `${SITE_URL}/issue/${id}` },
    };
  } catch {
    // Falls back to root layout's defaults if anything goes wrong.
    return {};
  }
}

export default function IssueLayout({ children }) {
  return children;
}
