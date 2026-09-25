// Does this title look like a collected edition rather than a monthly run?
//
// Lifted out of instagramBot.js, where it already screened trades out of
// "New to the Catalog" posts after one went out featuring "Captain Marvel By
// Kelly Thompson #1", which is a trade paperback.
//
// It matters far more in the volume resolver. Picking the wrong ComicVine
// volume is the expensive mistake in this repo: covers, issue counts, values
// and run-completion badges all key off it, and a trade collection sits under
// the same title and often the same start year as the monthly it reprints.
// That exact substitution is on record here — a "successful" live-ingest
// match turned out to be a trade collection rather than the series.
//
// Title-only, deliberately. gcd_series.publishing_format (migration 0028)
// carries the real answer, but it is populated on 360 of 209,398 rows, and
// ComicVine search candidates carry no format field at all. Until that is
// filled in, the title is the evidence available.

// `\bby\b` catches ComicVine's "X by Creator" trade naming.
// `\bvol\.?\s*\d` catches "Vol. 3" / "Vol 3", the standard trade numbering.
const COLLECTED_TITLE =
  /\bby\b|omnibus|collection|compendium|library|tpb|hardcover|\bhc\b|\bvol\.?\s*\d|complete\b|treasury|epic collection|masterworks/i;

// ComicVine names collected-edition scans by format: "...-tpb.jpeg", "...-hc.jpg".
const COLLECTED_PATH = /[-_](tpb|hc|hardcover|omnibus|trade)[-_.]/i;

export function looksCollectedTitle(title) {
  return COLLECTED_TITLE.test(String(title ?? ""));
}

export function looksCollectedPath(storagePath) {
  return COLLECTED_PATH.test(String(storagePath ?? ""));
}

export function looksCollected(title, storagePath) {
  return looksCollectedTitle(title) || looksCollectedPath(storagePath);
}
