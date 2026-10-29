import { normalizeWorkTitle } from "./seriesEditions.js";

const COLLECTED = /trade paperback|\btpb\b|hardcover|\bhc\b|collecting|collects|collected edition\b|omnibus|compendium|graphic novel|deluxe|softcover/i;
const HC_FORMAT = /hardcover|\bhc\b|omnibus|deluxe|absolute|library edition|artist'?s edition/i;
const TPB_FORMAT = /trade paperback|\btpb\b|softcover|compendium/i;
const HC_TAGS = new Set(["HC", "Deluxe", "Absolute", "Omnibus", "Library Edition", "Artist's Edition"]);
const TPB_TAGS = new Set(["TPB", "Compendium"]);
const MIN_SCORE = 10;

function plainText(value) {
  return String(value ?? "").replace(/<[^>]*>/g, " ").replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&");
}

function publisherKey(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((word) => word && !["comics", "publishing", "entertainment", "inc", "the"].includes(word))
    .join(" ");
}

function publisherMatches(left, right) {
  const a = publisherKey(left);
  const b = publisherKey(right);
  return Boolean(a && b && (a === b || a.startsWith(b) || b.startsWith(a)));
}

// Only the deck and the opening of the description. A monthly's description
// often ends with a "Collected Editions" list naming its TPBs, which would
// make the monthly itself look like a trade.
const LEAD_CHARS = 300;

function volumeText(volume) {
  const description = plainText(volume.description).replace(/\s+/g, " ").trim().slice(0, LEAD_CHARS);
  return `${plainText(volume.deck)} ${description}`.trim();
}

function knownNumber(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function scorePair(edition, volume) {
  const text = volumeText(volume);
  const reasons = ["base 10"];
  let score = 10;
  const isHc = HC_TAGS.has(edition.tag);
  const isTpb = TPB_TAGS.has(edition.tag);
  if ((isHc && HC_FORMAT.test(text)) || (isTpb && TPB_FORMAT.test(text))) {
    score += 3;
    reasons.push("format +3");
  } else if (
    (isHc && TPB_FORMAT.test(text) && !HC_FORMAT.test(text))
    || (edition.tag === "TPB" && HC_FORMAT.test(text) && !TPB_FORMAT.test(text))
  ) {
    score -= 5;
    reasons.push("format -5");
  }
  const volumeYear = knownNumber(volume.start_year);
  const editionYear = knownNumber(edition.year_start);
  if (volumeYear != null && editionYear != null && volumeYear === editionYear) {
    score += 2;
    reasons.push("exact year +2");
  }
  const volumeCount = knownNumber(volume.count_of_issues);
  const editionCount = knownNumber(edition.issue_count);
  if (volumeCount > 0 && editionCount > 0 && volumeCount === editionCount) {
    score += 2;
    reasons.push("exact count +2");
  }
  return { score, reasons };
}

function passingPairs(edition, candidates, pinnedVolumeIds) {
  let pool = candidates.filter((volume) => normalizeWorkTitle(volume.name) === normalizeWorkTitle(edition.title));
  if (!pool.length) return { pairs: [], reason: "no-candidate" };
  pool = pool.filter((volume) => publisherMatches(edition.publisher, volume.publisher?.name));
  if (!pool.length) return { pairs: [], reason: "publisher" };
  pool = pool.filter((volume) => {
    const editionYear = knownNumber(edition.year_start);
    const volumeYear = knownNumber(volume.start_year);
    return editionYear != null && volumeYear != null && Math.abs(volumeYear - editionYear) <= 1;
  });
  if (!pool.length) return { pairs: [], reason: "year" };
  pool = pool.filter((volume) => COLLECTED.test(volumeText(volume)));
  if (!pool.length) return { pairs: [], reason: "not-collected" };
  pool = pool.filter((volume) => !pinnedVolumeIds.has(volume.id));
  if (!pool.length) return { pairs: [], reason: "pinned" };
  pool = pool.filter((volume) => {
    const editionCount = Number(edition.issue_count);
    const volumeCount = Number(volume.count_of_issues);
    if (!(editionCount > 0 && volumeCount > 0)) return true;
    return Math.abs(volumeCount - editionCount) <= Math.max(1, Math.round(0.34 * Math.max(volumeCount, editionCount)));
  });
  if (!pool.length) return { pairs: [], reason: "count" };
  // A format disagreement (GCD says TPB, ComicVine says hardcover) costs more
  // than every bonus can repay: skip it rather than pin a maybe.
  const pairs = pool
    .map((volume) => ({ edition, volume, ...scorePair(edition, volume) }))
    .filter((pair) => pair.score >= MIN_SCORE);
  if (!pairs.length) return { pairs: [], reason: "format" };
  return { pairs, reason: null };
}

export function matchTradeVolumes({ editions, candidates, pinnedVolumeIds }) {
  const skipped = [];
  const pairs = [];
  const ambiguous = new Set();
  for (const edition of editions) {
    const result = passingPairs(edition, candidates, pinnedVolumeIds);
    if (!result.pairs.length) {
      skipped.push({ gcd_id: edition.gcd_id, reason: result.reason });
      continue;
    }
    const scores = result.pairs.map((pair) => pair.score).sort((a, b) => b - a);
    if (scores.length > 1 && scores[0] === scores[1]) {
      ambiguous.add(edition.gcd_id);
      skipped.push({ gcd_id: edition.gcd_id, reason: "ambiguous" });
      continue;
    }
    pairs.push(...result.pairs);
  }

  pairs.sort((a, b) => b.score - a.score || Number(a.edition.gcd_id) - Number(b.edition.gcd_id) || Number(a.volume.id) - Number(b.volume.id));
  const usedEditions = new Set(ambiguous);
  const usedVolumes = new Set();
  const matches = [];
  for (const pair of pairs) {
    if (usedEditions.has(pair.edition.gcd_id) || usedVolumes.has(pair.volume.id)) continue;
    usedEditions.add(pair.edition.gcd_id);
    usedVolumes.add(pair.volume.id);
    matches.push({
      gcd_id: pair.edition.gcd_id,
      volume_id: pair.volume.id,
      score: pair.score,
      reasons: pair.reasons,
    });
  }
  for (const edition of editions) {
    if (!usedEditions.has(edition.gcd_id) && !skipped.some((row) => row.gcd_id === edition.gcd_id)) {
      skipped.push({ gcd_id: edition.gcd_id, reason: "no-candidate" });
    }
  }
  return { matches, skipped };
}
