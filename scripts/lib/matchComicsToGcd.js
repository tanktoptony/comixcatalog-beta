import { mapRow } from "../../src/lib/import/import.js";
import { publisherMatches } from "./publisherMatch.js";

const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

const COMIC_IMPORT_MAPPING = {
  series_title: "series",
  issue_number: "issue",
  publisher: "publisher",
  release_year: "year",
  variant_name: "variant",
};

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

export function memberComicTitle(comic) {
  const title = clean(comic?.series_title) || "Untitled";
  const issue = clean(comic?.issue_number).replace(/^#+\s*/, "");
  const variant = clean(comic?.variant_name);
  return `${title}${issue ? ` #${issue}` : ""}${variant ? ` (${variant})` : ""}`;
}

export function importerRowForComic(comic, i) {
  return mapRow(comic ?? {}, i, COMIC_IMPORT_MAPPING);
}

export function editionNameKey(value) {
  return clean(value)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

// The importer ignores the year when only one volume of a title has the
// number (a 1982 "Swamp Thing #35" matched the 2011 volume), which is fine
// for a collector who confirms the result and not for an unattended link.
// So the member's year and publisher, when given, must agree with GCD's.
export function sourceDisagreement(comic, issue, gcdSeries) {
  const year = positiveInteger(comic?.release_year);
  const began = positiveInteger(gcdSeries?.year_began);
  const issueYear = positiveInteger(String(issue?.key_date ?? "").slice(0, 4));
  if (year && began && year < began - 1) return `year ${year} is before the GCD volume began (${began})`;
  if (year && issueYear && year > issueYear) return `year ${year} is after the GCD issue (${issueYear})`;
  const publisher = clean(comic?.publisher);
  const gcdPublisher = clean(gcdSeries?.publisher_name);
  if (publisher && gcdPublisher && !publisherMatches(publisher, gcdPublisher)) {
    return `publisher "${publisher}" differs from GCD's "${gcdPublisher}"`;
  }
  return null;
}

export function decideComicGcdMatch({ comic, resolution, editions = [], gcdSeriesById = new Map() } = {}) {
  const comicId = comic?.id ?? null;
  const book = memberComicTitle(comic);
  const existingGcdId = positiveInteger(comic?.gcd_id);
  if (existingGcdId) {
    return { accepted: false, comicId, book, reason: `already linked to GCD ${existingGcdId}` };
  }

  if (resolution?.result !== "matched") {
    const reason = resolution?.result === "pick"
      ? `ambiguous: ${clean(resolution.reason) || "the importer requires a collector choice"}`
      : resolution?.result === "suggested"
        ? "suggested match requires collector confirmation"
        : clean(resolution?.reason) || "not found by the importer";
    return { accepted: false, comicId, book, reason };
  }

  const baseGcdId = positiveInteger(resolution.gcd_issue_id);
  if (!baseGcdId) return { accepted: false, comicId, book, reason: "importer returned no valid GCD issue id" };

  const family = editions.filter((edition) => {
    const gcdId = positiveInteger(edition?.gcd_id);
    const baseId = positiveInteger(edition?.base_gcd_issue_id ?? edition?.variant_of_gcd_id);
    return gcdId === baseGcdId || baseId === baseGcdId;
  });
  const baseIssue = family.find((edition) => positiveInteger(edition?.gcd_id) === baseGcdId);
  if (!baseIssue) return { accepted: false, comicId, book, reason: `matched GCD issue ${baseGcdId} was not returned` };

  const disagreement = sourceDisagreement(comic, baseIssue, gcdSeriesById.get(positiveInteger(baseIssue.series_gcd_id)));
  if (disagreement) return { accepted: false, comicId, book, reason: disagreement };

  const wantedVariant = clean(comic?.variant_name);
  if (!wantedVariant) {
    return { accepted: true, comicId, book, gcdIssueId: baseGcdId, issue: baseIssue, edition: "Base edition" };
  }

  const wantedKey = editionNameKey(wantedVariant);
  const matches = family.filter((edition) =>
    positiveInteger(edition?.gcd_id) !== baseGcdId
      && editionNameKey(edition?.variant_name) === wantedKey
  );
  if (matches.length !== 1) {
    const reason = matches.length
      ? `${matches.length} GCD editions match variant "${wantedVariant}"`
      : `no GCD edition matches variant "${wantedVariant}"`;
    return { accepted: false, comicId, book, reason };
  }

  const issue = matches[0];
  return {
    accepted: true,
    comicId,
    book,
    gcdIssueId: positiveInteger(issue.gcd_id),
    issue,
    edition: clean(issue.variant_name),
  };
}
