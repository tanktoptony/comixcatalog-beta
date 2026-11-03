// Pure pieces of the ComicVine first-appearance import
// (scripts/importKeyIssuesFromCrawl.js). No I/O, so they are unit-tested
// directly (keyIssuesFromCrawl.test.js).
//
// Input is the characters crawl (one ComicVine /characters page per line):
// each character carries count_of_issue_appearances and
// first_appeared_in_issue { id, issue_number }. We turn "character X first
// appeared in ComicVine issue N" into key_issues rows keyed by our GCD issue.

// Real people and public-domain figures (Abraham Lincoln, Dracula) have a
// ComicVine "first appearance" that no collector calls a key.
export const EXCLUDED_PUBLISHERS = new Set(["Non-Fictional", "In the Public Domain"]);

export const TIER_ONE_APPEARANCES = 1000;

// ComicVine sometimes credits a first appearance to a promo or reference
// book (Danny Ketch's Ghost Rider "first appears" in Marvel Age #87, a
// preview magazine). Collectors don't call those keys. Marvel Preview stays:
// it ran real stories (Rocket Raccoon, Star-Lord). FCBD issues stay too.
export const EXCLUDED_TITLE_PATTERNS = [
  /^marvel age\b/i,
  /^dc sampler\b/i,
  /who'?s who/i,
  /preview special/i,
  /^previews\b/i,
  /handbook/i,
  /\bguide\b/i,
];

export function isExcludedTitle(title) {
  const t = String(title ?? "");
  return EXCLUDED_TITLE_PATTERNS.some((re) => re.test(t));
}

// "001" and "1" are the same issue; "1/2" and "½" are not worth guessing at.
export function normalizeIssueNumber(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "";
  return raw.replace(/^#/, "").replace(/^0+(?=\d)/, "");
}

// Map of ComicVine issue id -> characters who first appeared there, most
// appearances first.
export function firstAppearancesByCvIssue(pages, { minAppearances = 50 } = {}) {
  const byIssue = new Map();
  for (const page of pages) {
    for (const c of page?.results ?? []) {
      const appearances = Number(c?.count_of_issue_appearances) || 0;
      const first = c?.first_appeared_in_issue;
      if (appearances < minAppearances || !first?.id || !c?.name) continue;
      if (EXCLUDED_PUBLISHERS.has(c?.publisher?.name)) continue;
      const key = Number(first.id);
      if (!byIssue.has(key)) byIssue.set(key, { cvIssueNumber: normalizeIssueNumber(first.issue_number), characters: [] });
      byIssue.get(key).characters.push({ name: String(c.name).trim(), appearances });
    }
  }
  for (const entry of byIssue.values()) {
    entry.characters.sort((a, b) => b.appearances - a.appearances || a.name.localeCompare(b.name));
  }
  return byIssue;
}

export function keyTier(topAppearances) {
  return topAppearances >= TIER_ONE_APPEARANCES ? 1 : 2;
}

export function keyReason(names) {
  const list = [...new Set(names)].filter(Boolean);
  if (list.length === 0) return null;
  if (list.length === 1) return `1st appearance of ${list[0]}`;
  const shown = list.slice(0, 3);
  const more = list.length > 3;
  const joined = more
    ? `${shown.join(", ")} and more`
    : `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`;
  return `1st appearances of ${joined}`;
}

// The cover link can also land on a later edition of the right book: a
// foreign reprint (Superman #64 on the Australian K.G. Murray edition), a
// facsimile or a dollar reprint (100 Bullets #12 dated 2008). The 10-28 load
// put 157 keys on such editions. Two tells:
//   - the cover's date and the GCD issue's date are more than a year apart
//   - the cover row's own series is a different one and the GCD issue sits in
//     a non-US series (the US cover got attached to a reprint)
export function isWrongEdition(issue, cover) {
  if (!cover) return false;
  if (cover.year != null && issue.year != null && Math.abs(cover.year - issue.year) > 1) return true;
  return cover.seriesGcdId != null && issue.seriesGcdId != null
    && cover.seriesGcdId !== issue.seriesGcdId && issue.usMarket === false;
}

// Build key_issues rows.
//   byCvIssue        output of firstAppearancesByCvIssue
//   gcdIdByCvIssue   Map cvIssueId -> gcd_issue_id (from canonical_covers)
//   issueByGcdId     Map gcd_issue_id -> { issue_number, title, publisher, year, seriesGcdId?, usMarket?, variantOf? }
//   coverByCvIssue   Map cvIssueId -> { year, seriesGcdId } from the linking cover row (optional)
//   existingGcdIds   Set of gcd_issue_ids already in key_issues (hand-curated; never overwritten)
// Returns { rows, skipped } where skipped counts why candidates were dropped.
export function buildKeyRows({ byCvIssue, gcdIdByCvIssue, issueByGcdId, coverByCvIssue = new Map(), existingGcdIds = new Set() }) {
  const skipped = { noGcdLink: 0, noIssue: 0, numberMismatch: 0, wrongEdition: 0, alreadyKey: 0, promoBook: 0 };
  const merged = new Map(); // gcd_issue_id -> characters (several CV issues can map to one GCD issue)
  for (const [cvIssueId, entry] of byCvIssue) {
    let gcdId = gcdIdByCvIssue.get(cvIssueId);
    if (gcdId == null) { skipped.noGcdLink += 1; continue; }
    let issue = issueByGcdId.get(gcdId);
    if (!issue) { skipped.noIssue += 1; continue; }
    // A key belongs on the regular edition, not a variant cover record.
    if (issue.variantOf != null && issueByGcdId.has(issue.variantOf)) {
      gcdId = issue.variantOf;
      issue = issueByGcdId.get(gcdId);
    }
    // The ComicVine -> GCD link comes from cover matching, which has been
    // wrong before. A "1st appearance" on the wrong book is worse than none,
    // so the issue numbers must agree.
    if (entry.cvIssueNumber && normalizeIssueNumber(issue.issue_number) !== entry.cvIssueNumber) {
      skipped.numberMismatch += 1;
      continue;
    }
    if (isWrongEdition(issue, coverByCvIssue.get(cvIssueId))) { skipped.wrongEdition += 1; continue; }
    if (existingGcdIds.has(gcdId)) { skipped.alreadyKey += 1; continue; }
    if (isExcludedTitle(issue.title)) { skipped.promoBook += 1; continue; }
    if (!merged.has(gcdId)) merged.set(gcdId, []);
    merged.get(gcdId).push(...entry.characters);
  }

  const rows = [];
  for (const [gcdId, characters] of merged) {
    const sorted = [...characters].sort((a, b) => b.appearances - a.appearances || a.name.localeCompare(b.name));
    const issue = issueByGcdId.get(gcdId);
    rows.push({
      gcd_issue_id: gcdId,
      title: issue.title ?? null,
      issue_number: issue.issue_number ?? null,
      publisher: issue.publisher ?? null,
      year: issue.year ?? null,
      character: sorted[0].name,
      reason: keyReason(sorted.map((c) => c.name)),
      tier: keyTier(sorted[0].appearances),
    });
  }
  rows.sort((a, b) => a.tier - b.tier || a.gcd_issue_id - b.gcd_issue_id);
  return { rows, skipped };
}
