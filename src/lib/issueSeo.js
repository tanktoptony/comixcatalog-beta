import { SITE_URL } from "./siteUrl.js";

export function issueName(issue) {
  const series = issue?.series_title || "Untitled";
  const number = issue?.issue_number ? ` #${issue.issue_number}` : "";
  const year = issue?.release_year ? ` (${issue.release_year})` : "";
  return `${series}${number}${year}`;
}

function fitDescription(parts, maxLength = 160) {
  let description = "";
  for (const part of parts.filter(Boolean)) {
    const candidate = description ? `${description} ${part}` : part;
    if (candidate.length <= maxLength) description = candidate;
  }
  return description;
}

export function buildIssueDescription(issue) {
  const subject = `${issue?.series_title || "This comic"}${issue?.issue_number ? ` #${issue.issue_number}` : ""}`;
  const publication = issue?.publisher && issue?.release_year
    ? `${subject}, published by ${issue.publisher} in ${issue.release_year}.`
    : issue?.publisher
      ? `${subject}, published by ${issue.publisher}.`
      : issue?.release_year
        ? `${subject}, published in ${issue.release_year}.`
        : `${subject}.`;

  return fitDescription([
    publication,
    issue?.title ? `Story: ${issue.title}.` : null,
    issue?.key_issue?.reason ? `Key issue: ${issue.key_issue.reason}.` : null,
    "Cover, release date and story details, plus copies for sale from collectors.",
  ]);
}

export function buildIssueJsonLd(issue, id) {
  const series = {
    "@type": "ComicSeries",
    name: issue.series_title || "Untitled",
  };
  if (issue.series_id) series.url = `${SITE_URL}/series/${encodeURIComponent(issue.series_id)}`;

  const data = {
    "@context": "https://schema.org",
    "@type": "ComicIssue",
    name: issueName(issue),
    issueNumber: issue.issue_number != null ? String(issue.issue_number) : undefined,
    datePublished: issue.release_year != null ? String(issue.release_year) : undefined,
    publisher: issue.publisher
      ? { "@type": "Organization", name: issue.publisher }
      : undefined,
    image: issue.cover || undefined,
    isPartOf: series,
    url: `${SITE_URL}/issue/${encodeURIComponent(id)}`,
  };

  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
}
