import { SITE_URL } from "./siteUrl.js";
import { issueNumberSuffix } from "./issueNumberLabel.js";

export function issueName(issue) {
  const series = issue?.series_title || "Untitled";
  const number = issueNumberSuffix(issue?.issue_number);
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

function creditsFor(issue, role) {
  return (issue?.credits ?? []).filter((credit) => credit.role === role && credit.name);
}

function joinNames(names) {
  if (names.length < 2) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

function characterNames(issue) {
  const value = issue?.stories?.find((story) => story.characters)?.characters;
  if (Array.isArray(value)) return value.map(String).map((name) => name.trim()).filter(Boolean).slice(0, 12);
  return String(value ?? "").split(/[,;\n]+/).map((name) => name.trim()).filter(Boolean).slice(0, 12);
}

function truncate(value, maxLength) {
  const text = String(value ?? "").trim();
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 3).trimEnd()}...`;
}

export function buildIssueDescription(issue) {
  const subject = `${issue?.series_title || "This comic"}${issueNumberSuffix(issue?.issue_number)}`;
  const publication = issue?.publisher && issue?.release_year
    ? `${subject}, published by ${issue.publisher} in ${issue.release_year}.`
    : issue?.publisher
      ? `${subject}, published by ${issue.publisher}.`
      : issue?.release_year
        ? `${subject}, published in ${issue.release_year}.`
        : `${subject}.`;

  // A writer who also pencilled is named once ("By Jack Kirby.", not "By Jack
  // Kirby and Jack Kirby.").
  const creators = [...new Set([
    ...creditsFor(issue, "writer").map((credit) => credit.name),
    ...creditsFor(issue, "penciller").map((credit) => credit.name),
  ])];
  const creatorLine = creators.length ? `By ${joinNames(creators)}.` : null;
  return fitDescription([
    publication,
    creatorLine,
    issue?.title ? `Story: ${issue.title}.` : null,
    issue?.key_issue?.reason ? `Key issue: ${issue.key_issue.reason}.` : null,
    // Copies for sale outrank the contents list when 160 characters run out.
    forSaleLine(issue),
    pageContentsLine(issue),
  ]);
}

// Search results quote this line, so it names only what the page shows. It
// used to promise "Cover ... plus copies for sale" on every issue, including
// the many with no cover and no listings.
function pageContentsLine(issue) {
  const parts = [];
  if (issue?.cover) parts.push("cover");
  if (issue?.details?.on_sale_date || issue?.publication_date) parts.push("release date");
  if (issue?.stories?.some((story) => String(story.synopsis ?? story.title ?? "").trim())) parts.push("story details");
  if (creditsFor(issue, "writer").length || creditsFor(issue, "penciller").length) parts.push("credits");
  if (!parts.length) return "Track it in your collection on ComixCatalog.";
  const list = joinNames(parts);
  return `${list[0].toUpperCase()}${list.slice(1)} on ComixCatalog.`;
}

// market.listings_count comes from getIssuePageData (active listings only);
// the plain issue API always reports 0, so no count means no claim.
function forSaleLine(issue) {
  const count = Number(issue?.market?.listings_count ?? 0);
  if (!(count > 0)) return null;
  return `${count} ${count === 1 ? "copy" : "copies"} for sale from collectors.`;
}

export function buildIssueJsonLd(issue, id) {
  const series = {
    "@type": "ComicSeries",
    name: issue.series_title || "Untitled",
  };
  if (issue.series_id) series.url = `${SITE_URL}/series/${encodeURIComponent(issue.series_id)}`;

  const people = (role) => creditsFor(issue, role).map((credit) => ({
    "@type": "Person",
    name: credit.name,
    ...(credit.slug ? { url: `${SITE_URL}/creator/${encodeURIComponent(credit.slug)}` } : {}),
  }));
  const firstSynopsis = issue?.stories?.find((story) => String(story.synopsis ?? "").trim())?.synopsis;
  const datePublished = issue?.details?.on_sale_date || issue?.details?.keydate || issue?.publication_date || (issue?.release_year != null ? String(issue.release_year) : undefined);
  const characters = characterNames(issue).map((name) => ({ "@type": "Thing", name }));
  const data = {
    "@context": "https://schema.org",
    "@type": "ComicIssue",
    name: issueName(issue),
    issueNumber: issue.issue_number != null ? String(issue.issue_number) : undefined,
    datePublished,
    isbn: issue?.details?.isbn || undefined,
    numberOfPages: issue?.details?.page_count != null ? Number(issue.details.page_count) : undefined,
    publisher: issue.publisher
      ? { "@type": "Organization", name: issue.publisher }
      : undefined,
    image: issue.cover || undefined,
    isPartOf: series,
    url: `${SITE_URL}/issue/${encodeURIComponent(id)}`,
    author: people("writer").length ? people("writer") : undefined,
    illustrator: people("penciller").length ? people("penciller") : undefined,
    artist: people("penciller").length ? people("penciller") : undefined,
    inker: people("inker").length ? people("inker") : undefined,
    colorist: people("colorist").length ? people("colorist") : undefined,
    letterer: people("letterer").length ? people("letterer") : undefined,
    character: characters.length ? characters : undefined,
    abstract: firstSynopsis ? truncate(firstSynopsis, 300) : undefined,
    description: firstSynopsis ? truncate(firstSynopsis, 300) : undefined,
  };

  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
}
